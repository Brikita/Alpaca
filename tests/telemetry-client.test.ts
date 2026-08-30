import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlpacaSnapshot } from '../lib/alpaca-snapshot.ts';
import { publishTelemetrySnapshot } from '../lib/telemetry-client.ts';

const snapshot: AlpacaSnapshot = {
  schemaVersion: 1,
  source: 'alpaca-cli',
  mode: 'paper',
  capturedAt: '2026-08-29T20:05:56.430Z',
  account: {
    status: 'ACTIVE', currency: 'USD', cash: 100000, equity: 100000,
    previousEquity: 100000, buyingPower: 200000, optionsBuyingPower: 100000,
    optionsTradingLevel: 3, accountBlocked: false, tradingBlocked: false,
    suspendedByUser: false,
  },
  market: { timestamp: null, isOpen: false, nextOpen: null, nextClose: null },
  positions: [],
  openOrders: [],
};

test('publishes with separate ingest and private-site authorization', async (context) => {
  let capturedHeaders: Headers | undefined;
  context.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders = new Headers(init?.headers);
    return new Response(null, { status: 202 });
  });

  await publishTelemetrySnapshot(snapshot, 'https://volguard.test/api/telemetry', 'ingest-secret', 'site-secret');

  assert.equal(capturedHeaders?.get('authorization'), 'Bearer ingest-secret');
  assert.equal(capturedHeaders?.get('oai-sites-authorization'), 'Bearer site-secret');
});
