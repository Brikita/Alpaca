import assert from 'node:assert/strict';
import test from 'node:test';
import { isAlpacaSnapshot } from '../lib/telemetry-contract.ts';

const validSnapshot = {
  schemaVersion: 1,
  source: 'alpaca-cli',
  mode: 'paper',
  capturedAt: '2026-08-29T20:05:56.430Z',
  account: {
    status: 'ACTIVE',
    currency: 'USD',
    cash: 100000,
    equity: 100000,
    previousEquity: 100000,
    buyingPower: 200000,
    optionsBuyingPower: 100000,
    optionsTradingLevel: 3,
    accountBlocked: false,
    tradingBlocked: false,
    suspendedByUser: false,
  },
  market: {
    timestamp: '2026-08-29T20:05:56.430Z',
    isOpen: false,
    nextOpen: '2026-08-31T13:30:00.000Z',
    nextClose: '2026-08-31T20:00:00.000Z',
  },
  positions: [],
  openOrders: [],
};

test('accepts the minimum safe snapshot contract', () => {
  assert.equal(isAlpacaSnapshot(validSnapshot), true);
});

test('rejects live or malformed telemetry', () => {
  assert.equal(isAlpacaSnapshot({ ...validSnapshot, mode: 'live' }), false);
  assert.equal(isAlpacaSnapshot({ ...validSnapshot, account: { status: 'ACTIVE', equity: '100000' } }), false);
  assert.equal(isAlpacaSnapshot({ ...validSnapshot, positions: [{ symbol: 'SPY' }] }), false);
});
