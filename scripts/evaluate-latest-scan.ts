import type { AlpacaSnapshot } from '../lib/alpaca-snapshot.ts';
import { runAgentCouncil } from '../lib/agent-council.ts';
import type { OptionScanBatch } from '../lib/option-intelligence.ts';
import { constructPosition, toTradeProposal } from '../lib/position-constructor.ts';
import { evaluateProposal } from '../lib/risk-governor.ts';
import type { PaperOrderEvent } from '../lib/paper-order.ts';
import { MAX_OPEN_STRATEGIES, openPortfolio, portfolioPositionsMatch } from '../lib/portfolio-positions.ts';

function privateHeaders(): Record<string, string> {
  const token = process.env.VOLGUARD_SITES_BYPASS_TOKEN;
  return token ? { 'OAI-Sites-Authorization': `Bearer ${token}` } : {};
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: privateHeaders() });
  if (!response.ok) throw new Error(`Read failed (${response.status}) for ${url}`);
  return response.json() as Promise<T>;
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
  if (!snapshot || !batch) throw new Error('The hosted account snapshot and option scan are required.');
  const portfolio = openPortfolio(events);
  if (portfolio.entries.length >= MAX_OPEN_STRATEGIES) throw new Error('The two-strategy portfolio is full.');
  if (!portfolioPositionsMatch(portfolio.entries, snapshot.positions)) throw new Error('Broker positions do not match the portfolio ledger.');
  const leader = batch.scans.find((scan) => scan.symbol === batch.leaderSymbol);
  if (!leader) throw new Error('The latest scan has no leader.');
  if (portfolio.underlyings.has(leader.symbol)) throw new Error(`A ${leader.symbol} strategy is already open.`);

  const construction = constructPosition(leader);
  if (construction.status === 'blocked') {
    process.stdout.write(`${JSON.stringify({ leader: leader.symbol, signalStatus: leader.status, construction }, null, 2)}\n`);
  } else {
    const votes = runAgentCouncil(leader, construction.position);
    const proposal = { ...toTradeProposal(construction.position, votes), correlationSlotsAfter: portfolio.entries.length + 1 };
    const dailyDrawdown = Math.max(0, snapshot.account.previousEquity - snapshot.account.equity);
    const competitionDrawdown = Math.max(0, 100_000 - snapshot.account.equity);
    const decision = evaluateProposal(proposal, {
      openRisk: portfolio.openRisk,
      openPositions: portfolio.entries.length,
      dailyDrawdown,
      competitionDrawdown,
    });
    process.stdout.write(`${JSON.stringify({
      leader: leader.symbol,
      signalStatus: leader.status,
      position: construction.position,
      councilVotes: votes,
      riskDecision: decision,
    }, null, 2)}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to evaluate latest scan: ${message}\n`);
  process.exitCode = 1;
}
