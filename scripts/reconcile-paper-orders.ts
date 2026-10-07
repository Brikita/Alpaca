import { runAlpaca } from '../lib/alpaca-cli.ts';
import {
  reconcilePaperExitEvent,
  reconcilePaperOrderEvent,
  type AlpacaOrderResponse,
  type PaperOrderEvent,
} from '../lib/paper-order.ts';
import { publishPaperOrderEvent } from '../lib/telemetry-client.ts';
import { openPortfolio } from '../lib/portfolio-positions.ts';
import { reconcileOptionSettlement, type BrokerActivity } from '../lib/option-settlement.ts';

function configuration(): {
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

function privateHeaders(): Record<string, string> {
  const token = process.env.VOLGUARD_SITES_BYPASS_TOKEN;
  return token ? { 'OAI-Sites-Authorization': `Bearer ${token}` } : {};
}

try {
  const config = configuration();
  const [eventResponse, orders] = await Promise.all([
    fetch(config.endpoint, { headers: privateHeaders(), cache: 'no-store' }),
    runAlpaca<AlpacaOrderResponse[]>([
      'order', 'list', '--status', 'all', '--nested', '--limit', '100',
    ], { ...process.env, ALPACA_LIVE_TRADE: 'false' }),
  ]);
  if (!eventResponse.ok) throw new Error(`Order-event read failed (${eventResponse.status}).`);
  const { events } = await eventResponse.json() as { events: PaperOrderEvent[] };
  const existingKeys = new Set(events.map((event) => event.eventKey));
  const submissions = events.filter((event) => event.eventType === 'submitted');
  const exitSubmissions = events.filter((event) => event.eventType === 'exit_submitted');
  let published = 0;

  for (const order of orders.data) {
    const source = [...submissions, ...exitSubmissions]
      .find((event) => event.clientOrderId === order.client_order_id);
    if (!source) continue;
    const entry = source.exit
      ? events.find((event) => event.clientOrderId === source.exit?.entryClientOrderId
        && event.eventType === 'reconciled'
        && !event.exit)
      : null;
    const reconciled = source.exit && entry
      ? reconcilePaperExitEvent(source, entry, order)
      : reconcilePaperOrderEvent(source, order);
    if (existingKeys.has(reconciled.eventKey)) continue;
    await publishPaperOrderEvent(
      reconciled,
      config.endpoint,
      config.token,
      config.sitesBypassToken,
    );
    process.stdout.write(`${JSON.stringify({
      clientOrderId: reconciled.clientOrderId,
      brokerStatus: reconciled.brokerStatus,
      filledQuantity: reconciled.filledQuantity,
      filledAveragePrice: reconciled.filledAveragePrice,
    })}\n`);
    published += 1;
    events.push(reconciled);
  }
  const entries = openPortfolio(events).entries;
  if (entries.length) {
    const positions = await runAlpaca<Array<{ symbol: string }>>(['position', 'list']);
    const activities: BrokerActivity[] = [];
    let pageToken: string | undefined;
    for (let page = 0; ; page += 1) {
      if (page >= 50) throw new Error('Activity pagination exceeded its bound; settlement was not applied.');
      const result = await runAlpaca<BrokerActivity[]>(['account', 'activity', 'list',
        '--activity-types', 'OPEXP,OPEXC,OPASN', '--direction', 'asc', '--page-size', '100',
        '--after', entries.map((entry) => entry.recordedAt.slice(0, 10)).sort()[0],
        ...(pageToken ? ['--page-token', pageToken] : [])]);
      activities.push(...result.data);
      if (result.data.length < 100) break;
      const next = result.data.at(-1)?.id;
      if (!next || next === pageToken) throw new Error('Activity pagination did not advance.');
      pageToken = next;
    }
    for (const entry of entries) {
      const settled = reconcileOptionSettlement(entry, activities, new Set(positions.data.map((p) => p.symbol)));
      if (!settled || existingKeys.has(settled.eventKey)) continue;
      await publishPaperOrderEvent(settled, config.endpoint, config.token, config.sitesBypassToken);
      process.stdout.write(`${entry.symbol}: ${settled.message}\n`);
      published += 1;
    }
  }
  process.stdout.write(`Published ${published} new broker reconciliation event(s).\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Order reconciliation stopped: ${message}\n`);
  process.exitCode = 1;
}
