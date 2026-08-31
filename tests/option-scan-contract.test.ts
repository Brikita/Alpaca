import assert from 'node:assert/strict';
import test from 'node:test';
import { isOptionScanBatch } from '../lib/option-scan-contract.ts';
import { buildOptionScan, type OptionScanBatch } from '../lib/option-intelligence.ts';

function validBatch(): OptionScanBatch {
  const scan = buildOptionScan({
    symbol: 'SPY',
    capturedAt: '2026-08-28T15:00:00.000Z',
    expiration: '2026-09-04',
    marketOpen: true,
    stock: { latestTrade: { p: 100 } },
    bars: Array.from({ length: 12 }, (_, index) => ({
      c: 100 + Math.sin(index) * 1.5,
      t: `2026-08-${String(index + 10).padStart(2, '0')}T20:00:00Z`,
    })),
    chain: {
      snapshots: {
        SPY260904C00100000: { dailyBar: { c: 1, t: '2026-08-28', v: 100 }, latestQuote: { bp: 1.9, ap: 2.1, t: '2026-08-28T14:59:50.000Z' } },
        SPY260904P00100000: { dailyBar: { c: 1, t: '2026-08-28', v: 100 }, latestQuote: { bp: 1.9, ap: 2.1, t: '2026-08-28T14:59:50.000Z' } },
      },
    },
  });
  return {
    schemaVersion: 1,
    source: 'alpaca-cli',
    mode: 'paper',
    capturedAt: scan.capturedAt,
    marketOpen: true,
    targetExpiration: scan.expiration,
    universe: ['SPY'],
    scans: [scan],
    leaderSymbol: 'SPY',
    candidateCount: scan.status === 'candidate' ? 1 : 0,
  };
}

test('accepts a complete sanitized option scan batch', () => {
  assert.equal(isOptionScanBatch(validBatch()), true);
});

test('rejects an inconsistent candidate count', () => {
  const batch = validBatch();
  assert.equal(isOptionScanBatch({ ...batch, candidateCount: batch.candidateCount + 1 }), false);
});

test('rejects an incomplete decision trace', () => {
  const batch = validBatch();
  const scans = [{ ...batch.scans[0], checks: batch.scans[0].checks.slice(1) }];
  assert.equal(isOptionScanBatch({ ...batch, scans }), false);
});

test('rejects malformed or excessive wing quote payloads', () => {
  const batch = validBatch();
  const malformed = {
    ...batch,
    scans: [{ ...batch.scans[0], contracts: [{ symbol: 'bad', type: 'call', strike: 0 }] }],
  };
  assert.equal(isOptionScanBatch(malformed), false);

  const excessive = {
    ...batch,
    scans: [{ ...batch.scans[0], contracts: Array.from({ length: 201 }, () => ({
      symbol: 'SPY260904C00100000', type: 'call', strike: 100,
      bid: 1, ask: 1.1, mid: 1.05, spreadPct: 0.0952, quoteAgeSeconds: 1, volume: 10,
    })) }],
  };
  assert.equal(isOptionScanBatch(excessive), false);
});
