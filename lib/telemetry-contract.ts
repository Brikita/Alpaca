import type { AlpacaSnapshot } from './alpaca-snapshot.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isPosition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.symbol === 'string' &&
    typeof value.assetClass === 'string' &&
    isFiniteNumber(value.quantity) &&
    typeof value.side === 'string' &&
    isFiniteNumber(value.marketValue) &&
    isFiniteNumber(value.costBasis) &&
    isFiniteNumber(value.unrealizedPnl) &&
    isFiniteNumber(value.unrealizedPnlPct)
  );
}

function isOrder(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.clientOrderId === 'string' &&
    typeof value.symbol === 'string' &&
    typeof value.assetClass === 'string' &&
    typeof value.side === 'string' &&
    isFiniteNumber(value.quantity) &&
    typeof value.type === 'string' &&
    typeof value.status === 'string' &&
    isNullableString(value.submittedAt) &&
    typeof value.orderClass === 'string'
  );
}

export function isAlpacaSnapshot(value: unknown): value is AlpacaSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.source !== 'alpaca-cli' || value.mode !== 'paper') {
    return false;
  }
  if (typeof value.capturedAt !== 'string' || !isRecord(value.account) || !isRecord(value.market)) {
    return false;
  }
  const account = value.account;
  const market = value.market;
  return (
    typeof value.account.status === 'string' &&
    typeof account.currency === 'string' &&
    isFiniteNumber(account.cash) &&
    isFiniteNumber(account.equity) &&
    isFiniteNumber(account.previousEquity) &&
    isFiniteNumber(account.buyingPower) &&
    isFiniteNumber(account.optionsBuyingPower) &&
    isFiniteNumber(account.optionsTradingLevel) &&
    typeof account.accountBlocked === 'boolean' &&
    typeof account.tradingBlocked === 'boolean' &&
    typeof account.suspendedByUser === 'boolean' &&
    isNullableString(market.timestamp) &&
    typeof market.isOpen === 'boolean' &&
    isNullableString(market.nextOpen) &&
    isNullableString(market.nextClose) &&
    Array.isArray(value.positions) &&
    value.positions.every(isPosition) &&
    Array.isArray(value.openOrders) &&
    value.openOrders.every(isOrder)
  );
}
