import { collectAlpacaSnapshot } from '../lib/alpaca-snapshot.ts';
import { runAlpaca } from '../lib/alpaca-cli.ts';
import { evaluateExit, type OptionQuote } from '../lib/exit-policy.ts';
import {
  createPaperExitEvent,
  reconcilePaperExitEvent,
  runPaperExit,
  type AlpacaOrderResponse,
  type PaperOrderEvent,
} from '../lib/paper-order.ts';
import {
  publishPaperOrderEvent,
  publishTelemetrySnapshot,
} from '../lib/telemetry-client.ts';
import { openPortfolio, portfolioPositionsMatch } from '../lib/portfolio-positions.ts';
import { collectMarketCalendar } from '../lib/market-calendar.ts';
import { writeWorkflowOutputs } from '../lib/workflow-output.ts';

interface LatestOptionQuotesResponse {
  quotes?: Record<string, {
    ap?: number;
    bp?: number;
    t?: string;
  }>;
}

function privateHeaders(): Record<string, string> {
  const token = process.env.VOLGUARD_SITES_BYPASS_TOKEN;
  return token ? { 'OAI-Sites-Authorization': `Bearer ${token}` } : {};
}

function configuration(): {
  telemetryEndpoint: string;
  orderEndpoint: string;
  token: string;
  sitesBypassToken?: string;
} {
  const telemetryEndpoint = process.env.VOLGUARD_TELEMETRY_URL;
  const scanUrl = process.env.VOLGUARD_SCAN_URL;
  const token = process.env.VOLGUARD_TELEMETRY_TOKEN;
  if (!telemetryEndpoint || !scanUrl || !token) {
    throw new Error('VolGuard telemetry, scan URL, and ingest token are required.');
  }
  return {
    telemetryEndpoint,
    orderEndpoint: process.env.VOLGUARD_ORDER_EVENT_URL
      ?? new URL('/api/order-events', scanUrl).toString(),
    token,
    sitesBypassToken: process.env.VOLGUARD_SITES_BYPASS_TOKEN,
  };
}

async function readEvents(endpoint: string): Promise<PaperOrderEvent[]> {
  const response = await fetch(endpoint, { headers: privateHeaders(), cache: 'no-store' });
  if (!response.ok) throw new Error(`Order-event read failed (${response.status}).`);
  return (await response.json() as { events: PaperOrderEvent[] }).events;
}

function sanitizeQuotes(
  entry: PaperOrderEvent,
  response: LatestOptionQuotesResponse,
): Record<string, OptionQuote> {
  const quotes = response.quotes ?? {};
  return Object.fromEntries(entry.legs.map((leg) => {
    const quote = quotes[leg.symbol];
    if (!quote || !quote.bp || !quote.ap || !quote.t) {
      throw new Error(`Alpaca returned no complete quote for ${leg.symbol}.`);
    }
    return [leg.symbol, {
      bidPrice: quote.bp,
      askPrice: quote.ap,
      timestamp: quote.t,
    } satisfies OptionQuote];
  }));
}

async function publishEvent(
  event: PaperOrderEvent,
  config: ReturnType<typeof configuration>,
): Promise<void> {
  await publishPaperOrderEvent(
    event,
    config.orderEndpoint,
    config.token,
    config.sitesBypassToken,
  );
}

try {
  const config = configuration();
  const events = await readEvents(config.orderEndpoint);
  const portfolio = openPortfolio(events);
  const snapshot = await collectAlpacaSnapshot(process.env);
  await publishTelemetrySnapshot(
    snapshot,
    config.telemetryEndpoint,
    config.token,
    config.sitesBypassToken,
  );
  if (snapshot.mode !== 'paper') throw new Error('Only the paper account may be monitored.');
  if (!snapshot.market.isOpen) {
    process.stdout.write(`${JSON.stringify({
      stage: 'skipped',
      reason: 'market_closed',
      capturedAt: snapshot.capturedAt,
      nextOpen: snapshot.market.nextOpen,
    })}\n`);
    await writeWorkflowOutputs({ result: 'market_closed', alertKey: 'market-closed', message: 'Market closed; monitor skipped safely.' });
    process.exit(0);
  }
  if (snapshot.account.status !== 'ACTIVE'
    || snapshot.account.accountBlocked
    || snapshot.account.tradingBlocked
    || snapshot.account.suspendedByUser
  ) throw new Error('The paper account is not ready for position management.');
  if (snapshot.openOrders.length > 0) {
    throw new Error('An open broker order already exists; reconcile it before creating an exit.');
  }
  if (!portfolioPositionsMatch(portfolio.entries, snapshot.positions)) {
    throw new Error('Broker option legs do not exactly match the VolGuard portfolio ledger.');
  }
  if (portfolio.entries.length === 0) {
    process.stdout.write('No open VolGuard strategies require monitoring.\n');
    await writeWorkflowOutputs({ result: 'no_positions', alertKey: 'no-positions', message: 'No open VolGuard strategies require monitoring.' });
    process.exit(0);
  }

  const symbols = [...new Set(portfolio.entries.flatMap((entry) => entry.legs.map((leg) => leg.symbol)))].join(',');
  const quoteResponse = await runAlpaca<LatestOptionQuotesResponse>([
    'data', 'option', 'latest-quotes', '--symbols', symbols,
  ], { ...process.env, ALPACA_LIVE_TRADE: 'false' });
  const expirations = portfolio.entries.map((entry) => entry.expiration).sort();
  const latestExpiration = expirations.at(-1);
  if (!latestExpiration) throw new Error('An open strategy is missing its expiration.');
  const calendarStart = new Date(snapshot.capturedAt);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - 7);
  const calendarEnd = new Date(`${latestExpiration}T23:59:59.000Z`);
  const calendar = await collectMarketCalendar(calendarStart, calendarEnd, {
    ...process.env, ALPACA_LIVE_TRADE: 'false',
  });
  let submittedAnyExit = false;
  for (const entry of portfolio.entries) {
    const evaluation = evaluateExit({
      entry,
      positions: snapshot.positions,
      quotes: sanitizeQuotes(entry, quoteResponse.data),
      calendar,
    });
    const monitored = createPaperExitEvent({
      eventType: 'monitored', entry, evaluation, brokerStatus: evaluation.shouldExit ? 'exit_ready' : 'hold',
    });
    await publishEvent(monitored, config);
    process.stdout.write(`${JSON.stringify({ stage: 'monitored', symbol: entry.symbol, evaluation }, null, 2)}\n`);

    if (!evaluation.shouldExit) {
      process.stdout.write(`${entry.symbol} held: no fresh, matched deterministic exit trigger is active.\n`);
    } else {
      const preview = await runPaperExit(entry, evaluation, true, process.env);
      await publishEvent(preview, config);
      process.stdout.write(`${JSON.stringify({ stage: 'exit_previewed', event: preview }, null, 2)}\n`);

      if (process.env.VOLGUARD_EXIT_ENABLED !== 'paper') {
        process.stdout.write('Paper exit submission remains locked. Set VOLGUARD_EXIT_ENABLED=paper for one deliberate run.\n');
      } else {
        try {
          const submitted = await runPaperExit(entry, evaluation, false, process.env);
          submittedAnyExit = true;
          await publishEvent(submitted, config);
          process.stdout.write(`${JSON.stringify({ stage: 'exit_submitted', event: submitted }, null, 2)}\n`);

          const orders = await runAlpaca<AlpacaOrderResponse[]>([
            'order', 'list', '--status', 'all', '--nested', '--limit', '100',
          ], { ...process.env, ALPACA_LIVE_TRADE: 'false' });
          const brokerOrder = orders.data.find((order) => order.client_order_id === submitted.clientOrderId);
          if (brokerOrder) {
            const reconciled = reconcilePaperExitEvent(submitted, entry, brokerOrder);
            await publishEvent(reconciled, config);
            process.stdout.write(`${JSON.stringify({ stage: 'exit_reconciled', event: reconciled }, null, 2)}\n`);
          }
        } catch (error) {
          const rejected = createPaperExitEvent({
            eventType: 'exit_rejected', entry, evaluation, brokerStatus: 'rejected',
            message: 'The Alpaca paper exit was rejected; inspect the local runner output before retrying.',
          });
          await publishEvent(rejected, config);
          throw error;
        }
      }
    }
  }
  if (submittedAnyExit) {
    const postExitSnapshot = await collectAlpacaSnapshot(process.env);
    await publishTelemetrySnapshot(postExitSnapshot, config.telemetryEndpoint, config.token, config.sitesBypassToken);
  }
  await writeWorkflowOutputs({
    result: submittedAnyExit ? 'exit_submitted' : 'held',
    alertKey: submittedAnyExit ? 'exit-submitted' : 'exit-threshold-not-reached',
    message: submittedAnyExit ? 'A governed paper exit was submitted.' : 'Open strategies remain inside deterministic exit thresholds.',
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await writeWorkflowOutputs({ result: 'failed', alertKey: 'monitor-failed', message });
  process.stderr.write(`Position monitoring stopped: ${message}\n`);
  process.exitCode = 1;
}
