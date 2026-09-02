import type { SafePosition } from './alpaca-snapshot.ts';
import type { PaperOrderEvent } from './paper-order.ts';

export const MAX_OPEN_STRATEGIES = 2;

export interface OpenPortfolio {
  entries: PaperOrderEvent[];
  openRisk: number;
  underlyings: Set<string>;
}

export function openPortfolio(events: PaperOrderEvent[]): OpenPortfolio {
  const closedEntryIds = new Set(events
    .filter((event) => event.eventType === 'exit_reconciled'
      && event.brokerStatus === 'filled'
      && event.filledQuantity > 0)
    .map((event) => event.exit?.entryClientOrderId)
    .filter((value): value is string => Boolean(value)));
  const entriesById = new Map<string, PaperOrderEvent>();
  for (const event of events) {
    if (event.eventType !== 'reconciled'
      || event.exit
      || event.brokerStatus !== 'filled'
      || event.filledQuantity <= 0
      || event.filledAveragePrice === null
      || closedEntryIds.has(event.clientOrderId)
    ) continue;
    const existing = entriesById.get(event.clientOrderId);
    if (!existing || event.recordedAt > existing.recordedAt) entriesById.set(event.clientOrderId, event);
  }
  const entries = [...entriesById.values()].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  return {
    entries,
    openRisk: entries.reduce((total, entry) => total + entry.maxLoss, 0),
    underlyings: new Set(entries.map((entry) => entry.symbol)),
  };
}

export function portfolioPositionsMatch(entries: PaperOrderEvent[], positions: SafePosition[]): boolean {
  const expected = new Map<string, number>();
  for (const entry of entries) {
    for (const leg of entry.legs) {
      const signedQuantity = leg.positionIntent === 'buy_to_open' ? entry.quantity : -entry.quantity;
      expected.set(leg.symbol, (expected.get(leg.symbol) ?? 0) + signedQuantity);
    }
  }
  const actualOptions = positions.filter((position) => position.assetClass === 'us_option');
  if (actualOptions.length !== expected.size) return false;
  return actualOptions.every((position) => expected.get(position.symbol) === position.quantity);
}
