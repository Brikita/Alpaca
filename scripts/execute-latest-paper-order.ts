import type { AlpacaSnapshot } from '../lib/alpaca-snapshot.ts';
import { runAgentCouncil } from '../lib/agent-council.ts';
import type { OptionScanBatch } from '../lib/option-intelligence.ts';
import {
  createPaperOrderEvent,
  reconcilePaperOrder,
  runPaperOrder,
  type PaperOrderEvent,
} from '../lib/paper-order.ts';
import { constructPosition, toTradeProposal } from '../lib/position-constructor.ts';
import { evaluateProposal } from '../lib/risk-governor.ts';
import { MAX_OPEN_STRATEGIES, openPortfolio, portfolioPositionsMatch } from '../lib/portfolio-positions.ts';
import { publishPaperOrderEvent } from '../lib/telemetry-client.ts';

const STARTING_EQUITY = 100_000;
const MAX_EVIDENCE_AGE_SECONDS = 60;

class PaperExecutionHold extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaperExecutionHold';
  }
}

function hold(message: string): never {
  throw new PaperExecutionHold(message);
}

function privateHeaders(): Record<string, string> {
  const token = process.env.VOLGUARD_SITES_BYPASS_TOKEN;
  return token ? { 'OAI-Sites-Authorization': `Bearer ${token}` } : {};
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: privateHeaders(), cache: 'no-store' });
  if (!response.ok) throw new Error(`Read failed (${response.status}) for ${url}`);
  return response.json() as Promise<T>;
}

function ageSeconds(timestamp: string): number {
  return Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 1000);
}

function publisherConfiguration(): {
  endpoint: string;
  token: string;
  sitesBypassToken?: string;
} {
  const scanUrl = process.env.VOLGUARD_SCAN_URL;
  const token = process.env.VOLGUARD_TELEMETRY_TOKEN;
  if (!scanUrl || !token) throw new Error('VolGuard scan URL and telemetry token are required.');
  return {
    endpoint: process.env.VOLGUARD_ORDER_EVENT_URL
      ?? new URL('/api/order-events', scanUrl).toString(),
    token,
    sitesBypassToken: process.env.VOLGUARD_SITES_BYPASS_TOKEN,
  };
}

async function publish(event: PaperOrderEvent): Promise<void> {
  const config = publisherConfiguration();
  await publishPaperOrderEvent(
    event,
    config.endpoint,
    config.token,
    config.sitesBypassToken,
  );
}

try {
  const telemetryUrl = process.env.VOLGUARD_TELEMETRY_URL;
  const scanUrl = process.env.VOLGUARD_SCAN_URL;
  if (!telemetryUrl || !scanUrl) throw new Error('VolGuard telemetry and scan URLs are required.');

  const orderEventUrl = process.env.VOLGUARD_ORDER_EVENT_URL
    ?? new URL('/api/order-events', scanUrl).toString();
  const [{ snapshot }, { batch }, { events }] = await Promise.all([
    readJson<{ snapshot: AlpacaSnapshot | null }>(telemetryUrl),
    readJson<{ batch: OptionScanBatch | null }>(scanUrl),
    readJson<{ events: PaperOrderEvent[] }>(orderEventUrl),
  ]);
  if (!snapshot || !batch) throw new Error('Fresh hosted account and scan evidence are required.');
  if (snapshot.mode !== 'paper') throw new Error('Only the paper account may execute.');
  if (!snapshot.market.isOpen) hold('Market is closed; no paper order was created.');
  if (snapshot.account.status !== 'ACTIVE'
    || snapshot.account.accountBlocked
    || snapshot.account.tradingBlocked
    || snapshot.account.suspendedByUser
  ) throw new Error('The paper account is not ready for trading.');
  if (snapshot.account.optionsTradingLevel < 3) throw new Error('Options level 3 is required for multi-leg orders.');
  const portfolio = openPortfolio(events);
  if (snapshot.openOrders.length > 0) hold('Open broker orders require reconciliation before a new proposal.');
  if (portfolio.entries.length >= MAX_OPEN_STRATEGIES) hold('The two-strategy portfolio is full.');
  if (!portfolioPositionsMatch(portfolio.entries, snapshot.positions)) {
    throw new Error('Broker option legs do not exactly match the VolGuard portfolio ledger.');
  }

  const batchAge = ageSeconds(batch.capturedAt);
  const snapshotAge = ageSeconds(snapshot.capturedAt);
  if (batchAge > MAX_EVIDENCE_AGE_SECONDS || snapshotAge > MAX_EVIDENCE_AGE_SECONDS) {
    throw new Error('Account or scan evidence is stale; rerun snapshot and scan immediately before execution.');
  }
  const leader = batch.scans.find((scan) => scan.symbol === batch.leaderSymbol);
  if (!leader || leader.status !== 'candidate') hold('The fresh scan produced no eligible leader.');
  if (portfolio.underlyings.has(leader.symbol)) {
    hold(`A ${leader.symbol} strategy is already open; one position per underlying is enforced.`);
  }

  const construction = constructPosition(leader);
  if (construction.status === 'blocked') hold(construction.reason);
  const currentQuoteAge = Math.ceil(construction.position.quoteAgeSeconds + batchAge);
  const position = { ...construction.position, quoteAgeSeconds: currentQuoteAge };
  const votes = runAgentCouncil(leader, position);
  const proposal = { ...toTradeProposal(position, votes), correlationSlotsAfter: portfolio.entries.length + 1 };
  const decision = evaluateProposal(proposal, {
    openRisk: portfolio.openRisk,
    openPositions: portfolio.entries.length,
    dailyDrawdown: Math.max(0, snapshot.account.previousEquity - snapshot.account.equity),
    competitionDrawdown: Math.max(0, STARTING_EQUITY - snapshot.account.equity),
  });
  if (!decision.approved) {
    hold(`Risk governor blocked the proposal at ${decision.passed}/${decision.total} gates.`);
  }

  const preview = await runPaperOrder(position, batch.capturedAt, votes, decision, true);
  await publish(preview);
  process.stdout.write(`${JSON.stringify({ stage: 'previewed', event: preview }, null, 2)}\n`);

  if (process.env.VOLGUARD_EXECUTION_ENABLED !== 'paper') {
    process.stdout.write('Paper submission remains locked. Set VOLGUARD_EXECUTION_ENABLED=paper for one deliberate run.\n');
  } else {
    try {
      const submitted = await runPaperOrder(position, batch.capturedAt, votes, decision, false, process.env);
      process.stdout.write(`${JSON.stringify({ stage: 'submitted', event: submitted }, null, 2)}\n`);
      await publish(submitted);
      const reconciled = await reconcilePaperOrder(submitted, process.env);
      if (reconciled) {
        await publish(reconciled);
        process.stdout.write(`${JSON.stringify({ stage: 'reconciled', event: reconciled }, null, 2)}\n`);
      }
    } catch (error) {
      const rejected = createPaperOrderEvent({
        eventType: 'rejected',
        capturedAt: batch.capturedAt,
        position,
        votes,
        decision,
        brokerStatus: 'rejected',
        message: 'The Alpaca paper submission was rejected; inspect the local runner output before retrying.',
      });
      await publish(rejected);
      throw error;
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof PaperExecutionHold) {
    process.stdout.write(`Paper execution held safely: ${message}\n`);
  } else {
    process.stderr.write(`Paper execution stopped: ${message}\n`);
    process.exitCode = 1;
  }
}
