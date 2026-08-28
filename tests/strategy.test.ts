import assert from 'node:assert/strict';
import test from 'node:test';
import { selectStrategy } from '../lib/strategy.ts';

test('selects an iron condor when implied move is materially rich', () => {
  const selection = selectStrategy({
    symbol: 'SPY', modelMovePct: 0.74, impliedMovePct: 1.18,
    directionalConfidence: 0.42, direction: 'neutral', spreadPct: 0.06,
    quoteAgeSeconds: 8,
  });
  assert.equal(selection.strategy, 'iron_condor');
});

test('abstains when execution quality is poor', () => {
  const selection = selectStrategy({
    symbol: 'QQQ', modelMovePct: 1.2, impliedMovePct: 0.6,
    directionalConfidence: 0.3, direction: 'neutral', spreadPct: 0.18,
    quoteAgeSeconds: 8,
  });
  assert.equal(selection.strategy, 'abstain');
});
