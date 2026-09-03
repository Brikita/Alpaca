import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgentCouncil } from '../lib/agent-council.ts';
import type { CatalystSnapshot } from '../lib/catalyst.ts';
import type { OptionScan } from '../lib/option-intelligence.ts';
import type { ConstructedPosition } from '../lib/position-constructor.ts';
import { toTradeProposal } from '../lib/position-constructor.ts';
import { evaluateProposal } from '../lib/risk-governor.ts';
import type { DecisionMemory } from '../lib/decision-memory.ts';

const scan: OptionScan = {
  symbol: 'GLD', capturedAt: '2026-09-01T13:33:12.747Z', expiration: '2026-09-04',
  status: 'candidate', strategy: 'bear_put_spread', confidence: 0.75,
  thesis: 'Directional signal', underlyingPrice: 404.2, atmStrike: 404,
  callSymbol: 'GLD260904C00404000', putSymbol: 'GLD260904P00404000',
  callMid: 6, putMid: 7, modelMovePct: 3.2, impliedMovePct: 2.3,
  directionalConfidence: 0.75, direction: 'bearish', spreadPct: 0.07,
  quoteAgeSeconds: 9, combinedVolume: 3000, contracts: [],
  checks: [
    { id: 'session', label: 'Session', passed: true, detail: 'Open' },
    { id: 'history', label: 'History', passed: true, detail: 'Modeled' },
    { id: 'pair', label: 'Pair', passed: true, detail: 'Found' },
    { id: 'liquidity', label: 'Liquidity', passed: true, detail: 'Liquid' },
    { id: 'freshness', label: 'Freshness', passed: true, detail: 'Fresh' },
    { id: 'edge', label: 'Edge', passed: true, detail: 'Directional' },
  ],
};

const position: ConstructedPosition = {
  id: 'gld-spread', symbol: 'GLD', strategy: 'bear_put_spread',
  sourceStrategy: 'bear_put_spread', expiration: '2026-09-04', quantity: 1,
  legs: [
    { symbol: 'GLD260904P00404000', type: 'put', strike: 404, side: 'buy', quantity: 1, midpoint: 7, limitPrice: 7.19 },
    { symbol: 'GLD260904P00397000', type: 'put', strike: 397, side: 'sell', quantity: 1, midpoint: 3, limitPrice: 2.89 },
  ],
  netDebit: 4.3, maxLoss: 430, maxProfit: 270, riskBudget: 500,
  optimized: true, pricingBasis: 'buy-ask-sell-bid',
  rationale: 'Covered vertical', definedRisk: true, nakedShort: false,
  expiresToday: false, spreadPct: 0.0924, quoteAgeSeconds: 9, confidence: 0.75,
};

const clearCatalyst: CatalystSnapshot = {
  source: 'alpaca-news', capturedAt: '2026-09-01T13:33:12.747Z',
  status: 'clear', lookbackMinutes: 120, highImpactCount: 0, articles: [],
  rationale: 'No configured high-impact catalyst appeared in verified Alpaca news.',
};

const confirmedMemory: DecisionMemory = {
  schemaVersion: 1, symbol: 'GLD', generatedAt: scan.capturedAt, status: 'confirmed',
  approved: true, confidence: 1, lookbackMinutes: 60, observations: 2,
  confirmations: 2, agreementRatio: 1, currentStrategy: 'bear_put_spread',
  currentDirection: 'bearish', signalStrengthStart: 0.74, signalStrengthCurrent: 0.75,
  medianSpreadPct: 0.07, firstObservedAt: '2026-09-01T13:23:12.747Z',
  lastObservedAt: scan.capturedAt,
  rationale: 'GLD bear_put_spread bearish is confirmed in 2/2 open-market scans over 10m.',
};

test('produces five named, auditable votes without inventing specialist clearance', () => {
  const votes = runAgentCouncil(scan, position);
  assert.deepEqual(votes.map((vote) => vote.agent), ['regime', 'volatility', 'catalyst', 'memory', 'red_team']);
  assert.equal(votes.find((vote) => vote.agent === 'catalyst')?.approved, false);
  assert.equal(votes.find((vote) => vote.agent === 'memory')?.approved, false);
  assert.equal(votes.find((vote) => vote.agent === 'red_team')?.approved, true);
  assert.equal(votes.filter((vote) => vote.agent !== 'red_team' && vote.approved).length, 2);
});

test('allows the governor to approve only when council evidence and memory confirmation pass', () => {
  const decision = evaluateProposal(toTradeProposal(position, runAgentCouncil(scan, position, clearCatalyst, confirmedMemory)), {
    openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0,
  });
  assert.equal(decision.approved, true);
  assert.equal(decision.passed, 13);
});

test('fails closed when verified catalyst evidence is unavailable', () => {
  const decision = evaluateProposal(toTradeProposal(position, runAgentCouncil(scan, position, undefined, confirmedMemory)), {
    openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0,
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.gates.find((gate) => gate.id === 'council')?.passed, false);
});

test('fails closed when the current setup lacks memory confirmation', () => {
  const decision = evaluateProposal(toTradeProposal(position, runAgentCouncil(scan, position, clearCatalyst)), {
    openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0,
  });
  assert.equal(decision.approved, false);
  assert.match(decision.gates.find((gate) => gate.id === 'council')?.detail ?? '', /memory blocked/);
});

test('red team vetoes an oversized position', () => {
  const votes = runAgentCouncil(scan, { ...position, maxLoss: 501 });
  assert.equal(votes.find((vote) => vote.agent === 'red_team')?.approved, false);
});
