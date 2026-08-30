import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOptionScan, parseOptionSymbol, type PriceBar } from '../lib/option-intelligence.ts';
import { describeCollectorError, targetFriday } from '../lib/option-scan.ts';

const capturedAt = '2026-08-28T20:00:20Z';
const expiration = '2026-09-04';
const bars: PriceBar[] = Array.from({ length: 21 }, (_, index) => ({
  c: 100 * (1 + (index % 2 === 0 ? index * 0.001 : index * 0.0005)),
  t: new Date(Date.UTC(2026, 7, 1 + index)).toISOString(),
  v: 1_000_000,
}));
const chain = {
  snapshots: {
    SPY260904C00100000: { dailyBar: { c: 4, t: capturedAt, v: 1000 }, latestQuote: { bp: 3.95, ap: 4.05, t: '2026-08-28T20:00:00Z' } },
    SPY260904P00100000: { dailyBar: { c: 4, t: capturedAt, v: 1200 }, latestQuote: { bp: 3.95, ap: 4.05, t: '2026-08-28T20:00:00Z' } },
    SPY260904C00101000: { dailyBar: { c: 3, t: capturedAt, v: 900 }, latestQuote: { bp: 2.9, ap: 3.1, t: '2026-08-28T20:00:00Z' } },
    SPY260904P00101000: { dailyBar: { c: 5, t: capturedAt, v: 900 }, latestQuote: { bp: 4.9, ap: 5.1, t: '2026-08-28T20:00:00Z' } },
  },
};

test('parses OCC option symbols and selects the next Friday at least three days away', () => {
  assert.deepEqual(parseOptionSymbol('SPY260904P00770000'), {
    underlying: 'SPY', expiration: '2026-09-04', type: 'put', strike: 770,
  });
  assert.equal(targetFriday(new Date('2026-08-30T12:00:00Z')), '2026-09-04');
});

test('extracts a useful message from structured Alpaca CLI errors', () => {
  const error = new Error(JSON.stringify({
    error: 'subscription does not permit querying recent SIP data',
    status: 403,
  }, null, 2));
  assert.equal(describeCollectorError(error), 'subscription does not permit querying recent SIP data');
});

test('builds a candidate only when market, history, quotes, and edge all pass', () => {
  const scan = buildOptionScan({
    symbol: 'SPY', capturedAt, expiration, marketOpen: true,
    stock: { latestQuote: { bp: 99.98, ap: 100.02, t: '2026-08-28T20:00:00Z' } },
    bars,
    chain,
  });
  assert.equal(scan.status, 'candidate');
  assert.equal(scan.strategy, 'iron_condor');
  assert.equal(scan.atmStrike, 100);
  assert.equal(scan.checks.every((check) => check.passed), true);
});

test('abstains on the same signal when the market is closed and quotes are stale', () => {
  const scan = buildOptionScan({
    symbol: 'SPY', capturedAt: '2026-08-30T12:00:00Z', expiration, marketOpen: false,
    stock: { latestQuote: { bp: 99.98, ap: 100.02, t: '2026-08-28T20:00:00Z' } },
    bars,
    chain,
  });
  assert.equal(scan.status, 'abstain');
  assert.equal(scan.strategy, 'abstain');
  assert.equal(scan.checks.find((check) => check.id === 'session')?.passed, false);
  assert.equal(scan.checks.find((check) => check.id === 'freshness')?.passed, false);
  assert.equal(scan.checks.find((check) => check.id === 'edge')?.passed, true);
});
