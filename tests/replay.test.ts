import assert from 'node:assert/strict';
import test from 'node:test';
import type { PriceBar } from '../lib/option-intelligence.ts';
import { replaySymbol } from '../lib/replay.ts';

function trendBars(count: number): PriceBar[] {
  return Array.from({ length: count }, (_, index) => ({
    c: 100 + index + Math.sin(index) * 0.05,
    t: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
}

test('replay is deterministic and keeps the passive baseline separate', () => {
  const first = replaySymbol('SPY', trendBars(80));
  const second = replaySymbol('SPY', trendBars(80));
  assert.deepEqual(first, second);
  assert.equal(first.symbol, 'SPY');
  assert.ok(first.trades > 0);
  assert.ok(first.baselineReturnPct > 0);
  assert.ok(first.winRate !== null && first.winRate >= 0 && first.winRate <= 100);
});

test('empty data produces a bounded evidence record without invented trades', () => {
  assert.deepEqual(replaySymbol('GLD', []), {
    symbol: 'GLD', trades: 0, wins: 0, winRate: null, expectancyPct: null,
    cumulativeSignalReturnPct: 0, baselineReturnPct: 0, maxDrawdownPct: 0,
  });
});
