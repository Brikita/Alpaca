import assert from 'node:assert/strict';
import test from 'node:test';
import type { OptionScan } from '../lib/option-intelligence.ts';
import { constructPosition, toTradeProposal } from '../lib/position-constructor.ts';
import { evaluateProposal } from '../lib/risk-governor.ts';

const qqqCandidate: OptionScan = {
  symbol: 'QQQ', capturedAt: '2026-08-31T14:12:34.083Z', expiration: '2026-09-04',
  status: 'candidate', strategy: 'long_straddle', confidence: 0.66,
  thesis: 'Implied move is below the model range.', underlyingPrice: 713.67, atmStrike: 714,
  callSymbol: 'QQQ260904C00714000', putSymbol: 'QQQ260904P00714000',
  callMid: 5.51, putMid: 5.375, modelMovePct: 2.1777, impliedMovePct: 1.5252,
  directionalConfidence: 0.5, direction: 'neutral', spreadPct: 0.029,
  quoteAgeSeconds: 0, combinedVolume: 718, checks: [],
};

test('constructs exact long-straddle legs and maximum debit loss', () => {
  const result = constructPosition(qqqCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  assert.deepEqual(result.position.legs.map((leg) => leg.symbol), [
    'QQQ260904C00714000', 'QQQ260904P00714000',
  ]);
  assert.equal(result.position.netDebit, 10.89);
  assert.equal(result.position.maxLoss, 1089);
});

test('risk governor blocks the live-sized candidate before council review', () => {
  const result = constructPosition(qqqCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  const decision = evaluateProposal(toTradeProposal(result.position), {
    openRisk: 0, dailyDrawdown: 0, competitionDrawdown: 0,
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.gates.find((gate) => gate.id === 'trade-risk')?.passed, false);
  assert.equal(decision.gates.find((gate) => gate.id === 'council')?.passed, false);
});

test('blocks spread strategies until wing contracts are selected', () => {
  const result = constructPosition({ ...qqqCandidate, strategy: 'bear_put_spread' });
  assert.equal(result.status, 'blocked');
  if (result.status !== 'blocked') return;
  assert.match(result.reason, /additional wing contracts/);
});
