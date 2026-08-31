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
  quoteAgeSeconds: 0, combinedVolume: 718, contracts: [], checks: [],
};

const budgetedCandidate: OptionScan = {
  ...qqqCandidate,
  symbol: 'TEST', underlyingPrice: 100, atmStrike: 100, modelMovePct: 7,
  callSymbol: 'TEST260904C00100000', putSymbol: 'TEST260904P00100000',
  callMid: 4, putMid: 4,
  contracts: [
    { symbol: 'TEST260904P00093000', type: 'put', strike: 93, bid: 1.7, ask: 1.9, mid: 1.8, spreadPct: 0.1111, quoteAgeSeconds: 1, volume: 100 },
    { symbol: 'TEST260904C00100000', type: 'call', strike: 100, bid: 3.8, ask: 4.2, mid: 4, spreadPct: 0.1, quoteAgeSeconds: 1, volume: 500 },
    { symbol: 'TEST260904P00100000', type: 'put', strike: 100, bid: 3.8, ask: 4.2, mid: 4, spreadPct: 0.1, quoteAgeSeconds: 1, volume: 500 },
    { symbol: 'TEST260904C00107000', type: 'call', strike: 107, bid: 1.7, ask: 1.9, mid: 1.8, spreadPct: 0.1111, quoteAgeSeconds: 1, volume: 100 },
  ],
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

test('adds liquid wings near the modeled move and caps conservative debit at budget', () => {
  const result = constructPosition(budgetedCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  assert.equal(result.position.strategy, 'long_iron_butterfly');
  assert.equal(result.position.optimized, true);
  assert.equal(result.position.pricingBasis, 'buy-ask-sell-bid');
  assert.equal(result.position.legs.length, 4);
  assert.equal(result.position.netDebit, 5);
  assert.equal(result.position.maxLoss, 500);
  assert.equal(result.position.maxProfit, 200);
  assert.deepEqual(result.position.legs.map((leg) => [leg.side, leg.strike]), [
    ['buy', 100], ['buy', 100], ['sell', 107], ['sell', 93],
  ]);
});

test('budgeted structure clears trade risk but remains blocked without council votes', () => {
  const result = constructPosition(budgetedCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  const decision = evaluateProposal(toTradeProposal(result.position), {
    openRisk: 0, dailyDrawdown: 0, competitionDrawdown: 0,
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.gates.find((gate) => gate.id === 'trade-risk')?.passed, true);
  assert.equal(decision.gates.find((gate) => gate.id === 'council')?.passed, false);
  assert.equal(decision.passed, 11);
});

test('blocks spread strategies until wing contracts are selected', () => {
  const result = constructPosition({ ...qqqCandidate, strategy: 'bear_put_spread' });
  assert.equal(result.status, 'blocked');
  if (result.status !== 'blocked') return;
  assert.match(result.reason, /outside the first optimizer release/);
});
