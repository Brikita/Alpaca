import type { SafePosition } from './alpaca-snapshot.ts';
import { DEFAULT_RISK_POLICY } from './domain.ts';
import type { PaperOrderEvent } from './paper-order.ts';

export const MAX_OPEN_STRATEGIES = DEFAULT_RISK_POLICY.maxOpenPositions;

export type ExposureGroup = 'broad-equity' | 'equity-sector' | 'metals' | 'rates' | 'energy' | 'other';

const EXPOSURE_GROUPS: Readonly<Record<ExposureGroup, readonly string[]>> = {
  'broad-equity': ['SPY', 'QQQ', 'IWM', 'DIA'],
  'equity-sector': ['XLF', 'XLK', 'XLE'],
  metals: ['GLD', 'SLV'],
  rates: ['TLT'],
  energy: ['USO'],
  other: [],
};

export function exposureGroupForSymbol(symbol: string): ExposureGroup {
  const normalized = symbol.trim().toUpperCase();
  return (Object.entries(EXPOSURE_GROUPS)
    .find(([, symbols]) => symbols.includes(normalized))?.[0] as ExposureGroup | undefined) ?? 'other';
}

export function correlationSlotsAfter(entries: PaperOrderEvent[], candidateSymbol: string): number {
  const candidateGroup = exposureGroupForSymbol(candidateSymbol);
  return entries.filter((entry) => exposureGroupForSymbol(entry.symbol) === candidateGroup).length + 1;
}

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
  if (positions.length !== expected.size) return false;
  return positions.every((position) => position.assetClass === 'us_option'
    && expected.get(position.symbol) === position.quantity);
}

export function portfolioReconciliationMessage(entries: PaperOrderEvent[], positions: SafePosition[]): string {
  const expectedLegs = entries.reduce((count, entry) => count + entry.legs.length, 0);
  const actualOptionLegs = positions.filter((position) => position.assetClass === 'us_option').length;
  const otherPositions = positions.filter((position) => position.assetClass !== 'us_option');
  const otherSummary = otherPositions.length === 0
    ? 'no non-option positions'
    : otherPositions.map((position) => `${position.quantity} ${position.symbol} ${position.assetClass}`).join(', ');
  return `Portfolio reconciliation required: ledger expects ${expectedLegs} option legs across ${entries.length} strategies; broker has ${actualOptionLegs} option legs and ${otherSummary}. Review broker activity, expiry, exercise, and assignment before resuming paper entries.`;
}
