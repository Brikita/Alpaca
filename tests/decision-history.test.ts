import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeDecisionHistory } from '../lib/decision-history.ts';
import type { OptionScan, OptionScanBatch } from '../lib/option-intelligence.ts';

function scan(symbol: string, status: OptionScan['status'], capturedAt: string): OptionScan {
  return {
    symbol,
    capturedAt,
    expiration: '2026-09-04',
    status,
    strategy: status === 'candidate' ? 'bear_put_spread' : 'abstain',
    thesis: 'Recorded thesis',
    direction: status === 'candidate' ? 'bearish' : 'neutral',
    confidence: status === 'candidate' ? 0.75 : 0,
    directionalConfidence: 0.75,
    underlyingPrice: 400,
    atmStrike: 400,
    callSymbol: null,
    putSymbol: null,
    callMid: null,
    putMid: null,
    modelMovePct: 2,
    impliedMovePct: 1.5,
    spreadPct: 0.04,
    quoteAgeSeconds: 4,
    combinedVolume: 500,
    contracts: [],
    checks: [
      { id: 'session', label: 'Session', passed: true, detail: 'Market open' },
      { id: 'history', label: 'History', passed: status === 'candidate', detail: 'History unavailable' },
      { id: 'pair', label: 'Pair', passed: true, detail: 'Pair found' },
      { id: 'liquidity', label: 'Liquidity', passed: true, detail: 'Liquid' },
      { id: 'freshness', label: 'Freshness', passed: true, detail: 'Fresh' },
      { id: 'edge', label: 'Edge', passed: true, detail: 'Edge found' },
    ],
  };
}

function batch(capturedAt: string, scans: OptionScan[]): OptionScanBatch {
  return {
    schemaVersion: 1,
    source: 'alpaca-cli',
    mode: 'paper',
    capturedAt,
    marketOpen: true,
    targetExpiration: '2026-09-04',
    universe: scans.map((item) => item.symbol),
    scans,
    leaderSymbol: scans.find((item) => item.status === 'candidate')?.symbol ?? null,
    candidateCount: scans.filter((item) => item.status === 'candidate').length,
  };
}

test('flattens newest decisions first and preserves the stop reason', () => {
  const result = summarizeDecisionHistory([
    batch('2026-09-01T13:30:00.000Z', [scan('SPY', 'abstain', '2026-09-01T13:30:00.000Z')]),
    batch('2026-09-01T13:35:00.000Z', [scan('GLD', 'candidate', '2026-09-01T13:35:00.000Z')]),
  ]);

  assert.equal(result[0].symbol, 'GLD');
  assert.equal(result[0].reason, 'All signal gates passed. Candidate only — not an order.');
  assert.equal(result[1].reason, 'History unavailable');
  assert.equal(result[1].checksPassed, 5);
});

test('bounds the public history payload', () => {
  const scans = Array.from({ length: 50 }, (_, index) => (
    scan(`S${index}`, 'abstain', `2026-09-01T13:${String(index).padStart(2, '0')}:00.000Z`)
  ));
  assert.equal(summarizeDecisionHistory([batch('2026-09-01T13:30:00.000Z', scans)], 12).length, 12);
});
