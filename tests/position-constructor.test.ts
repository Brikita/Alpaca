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

const bearishCandidate: OptionScan = {
  ...qqqCandidate,
  symbol: 'BEAR', underlyingPrice: 100, atmStrike: 100, modelMovePct: 4,
  strategy: 'bear_put_spread', direction: 'bearish', confidence: 0.74,
  callSymbol: 'BEAR260904C00100000', putSymbol: 'BEAR260904P00100000',
  contracts: [
    { symbol: 'BEAR260904P00100000', type: 'put', strike: 100, bid: 4.8, ask: 5, mid: 4.9, spreadPct: 0.0408, quoteAgeSeconds: 2, volume: 500 },
    { symbol: 'BEAR260904P00096000', type: 'put', strike: 96, bid: 1.8, ask: 1.95, mid: 1.875, spreadPct: 0.08, quoteAgeSeconds: 3, volume: 100 },
    { symbol: 'BEAR260904P00095000', type: 'put', strike: 95, bid: 1.7, ask: 2, mid: 1.85, spreadPct: 0.1622, quoteAgeSeconds: 3, volume: 100 },
  ],
};

const bullishCandidate: OptionScan = {
  ...bearishCandidate,
  symbol: 'BULL', strategy: 'bull_call_spread', direction: 'bullish',
  callSymbol: 'BULL260904C00100000', putSymbol: 'BULL260904P00100000',
  contracts: [
    { symbol: 'BULL260904C00100000', type: 'call', strike: 100, bid: 4.8, ask: 5, mid: 4.9, spreadPct: 0.0408, quoteAgeSeconds: 2, volume: 500 },
    { symbol: 'BULL260904C00104000', type: 'call', strike: 104, bid: 1.8, ask: 1.95, mid: 1.875, spreadPct: 0.08, quoteAgeSeconds: 3, volume: 100 },
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
    openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0,
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
    openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0,
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.gates.find((gate) => gate.id === 'trade-risk')?.passed, true);
  assert.equal(decision.gates.find((gate) => gate.id === 'council')?.passed, false);
  assert.equal(decision.passed, 13);
});

test('rejects a budget-fitting butterfly when capped reward is below policy quality', () => {
  const weakPayoffCandidate: OptionScan = {
    ...budgetedCandidate,
    modelMovePct: 5,
    contracts: [
      { symbol: 'TEST260904P00095000', type: 'put', strike: 95, bid: 1.82, ask: 1.95, mid: 1.885, spreadPct: 0.069, quoteAgeSeconds: 1, volume: 100 },
      { symbol: 'TEST260904C00100000', type: 'call', strike: 100, bid: 3.8, ask: 4.2, mid: 4, spreadPct: 0.1, quoteAgeSeconds: 1, volume: 500 },
      { symbol: 'TEST260904P00100000', type: 'put', strike: 100, bid: 3.8, ask: 4.2, mid: 4, spreadPct: 0.1, quoteAgeSeconds: 1, volume: 500 },
      { symbol: 'TEST260904C00105000', type: 'call', strike: 105, bid: 1.82, ask: 1.95, mid: 1.885, spreadPct: 0.069, quoteAgeSeconds: 1, volume: 100 },
    ],
  };
  const result = constructPosition(weakPayoffCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  assert.equal(result.position.strategy, 'long_straddle');
  assert.equal(result.position.maxLoss, 800);
});

test('constructs a conservative bear put spread within the risk budget', () => {
  const result = constructPosition(bearishCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  assert.equal(result.position.strategy, 'bear_put_spread');
  assert.equal(result.position.netDebit, 3.2);
  assert.equal(result.position.maxLoss, 320);
  assert.equal(result.position.maxProfit, 80);
  assert.deepEqual(result.position.legs.map((leg) => [leg.side, leg.type, leg.strike]), [
    ['buy', 'put', 100], ['sell', 'put', 96],
  ]);
});

test('constructs the mirrored bull call spread', () => {
  const result = constructPosition(bullishCandidate);
  assert.equal(result.status, 'constructed');
  if (result.status !== 'constructed') return;
  assert.equal(result.position.strategy, 'bull_call_spread');
  assert.equal(result.position.maxLoss, 320);
  assert.equal(result.position.maxProfit, 80);
  assert.deepEqual(result.position.legs.map((leg) => [leg.side, leg.type, leg.strike]), [
    ['buy', 'call', 100], ['sell', 'call', 104],
  ]);
});

test('blocks directional spreads when no covered wing meets policy', () => {
  const result = constructPosition({ ...bearishCandidate, contracts: bearishCandidate.contracts.slice(0, 1) });
  assert.equal(result.status, 'blocked');
  if (result.status !== 'blocked') return;
  assert.match(result.reason, /No liquid covered wing/);
});

test('keeps unsupported short-volatility construction blocked', () => {
  const result = constructPosition({ ...qqqCandidate, strategy: 'iron_condor' });
  assert.equal(result.status, 'blocked');
  if (result.status !== 'blocked') return;
  assert.match(result.reason, /not implemented/);
});
