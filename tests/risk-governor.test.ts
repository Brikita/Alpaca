import assert from 'node:assert/strict';
import test from 'node:test';
import type { TradeProposal } from '../lib/domain.ts';
import { evaluateProposal } from '../lib/risk-governor.ts';

const safeProposal: TradeProposal = {
  id: 'proposal-1', symbol: 'SPY', strategy: 'iron_condor', maxLoss: 420,
  definedRisk: true, nakedShort: false, expiresToday: false, paperAccount: true,
  spreadPct: 0.06, quoteAgeSeconds: 8, correlationSlotsAfter: 1, confidence: 0.76,
  votes: [
    { agent: 'regime', approved: true, confidence: 0.82, rationale: 'Range-bound' },
    { agent: 'volatility', approved: true, confidence: 0.78, rationale: 'IV rich' },
    { agent: 'catalyst', approved: true, confidence: 0.8, rationale: 'Verified news is clear' },
    { agent: 'memory', approved: true, confidence: 1, rationale: 'Two recent scans agree' },
    { agent: 'red_team', approved: true, confidence: 0.71, rationale: 'Risk is defined' },
  ],
};

test('approves a proposal that passes every deterministic gate', () => {
  const result = evaluateProposal(safeProposal, {
    openRisk: 420, openPositions: 1, dailyDrawdown: 180, competitionDrawdown: 0,
  });
  assert.equal(result.approved, true);
  assert.equal(result.passed, 13);
});

test('blocks a trade that breaches per-trade and portfolio limits', () => {
  const result = evaluateProposal(
    { ...safeProposal, maxLoss: 900 },
    { openRisk: 900, openPositions: 1, dailyDrawdown: 180, competitionDrawdown: 0 },
  );
  assert.equal(result.approved, false);
  assert.equal(result.gates.find((item) => item.id === 'trade-risk')?.passed, false);
  assert.equal(result.gates.find((item) => item.id === 'portfolio-risk')?.passed, false);
});

test('blocks a third strategy even when its dollar risk would fit', () => {
  const result = evaluateProposal(
    { ...safeProposal, maxLoss: 50 },
    { openRisk: 500, openPositions: 2, dailyDrawdown: 0, competitionDrawdown: 0 },
  );
  assert.equal(result.approved, false);
  assert.equal(result.gates.find((item) => item.id === 'position-capacity')?.passed, false);
});

test('blocks the proposal when the verified catalyst agent vetoes it', () => {
  const votes = safeProposal.votes.map((vote) => vote.agent === 'catalyst'
    ? { ...vote, approved: false, rationale: 'Verified market-moving headline' }
    : vote);
  const result = evaluateProposal(
    { ...safeProposal, votes },
    { openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0 },
  );
  assert.equal(result.approved, false);
  assert.equal(result.gates.find((item) => item.id === 'council')?.passed, false);
});

test('blocks the proposal when recent analysis does not confirm the setup', () => {
  const votes = safeProposal.votes.map((vote) => vote.agent === 'memory'
    ? { ...vote, approved: false, rationale: 'Only one matching scan' }
    : vote);
  const result = evaluateProposal(
    { ...safeProposal, votes },
    { openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0 },
  );
  assert.equal(result.approved, false);
  assert.match(result.gates.find((item) => item.id === 'council')?.detail ?? '', /blocked: memory/);
});

for (const agent of ['regime', 'volatility'] as const) {
  test(`blocks the proposal when the ${agent} specialist rejects it`, () => {
    const votes = safeProposal.votes.map((vote) => vote.agent === agent
      ? { ...vote, approved: false, rationale: `${agent} rejected` }
      : vote);
    const result = evaluateProposal(
      { ...safeProposal, votes },
      { openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0 },
    );
    assert.equal(result.approved, false);
    assert.match(result.gates.find((item) => item.id === 'council')?.detail ?? '', new RegExp(`blocked: ${agent}`));
  });
}

test('blocks missing, duplicate, unknown, and malformed specialist votes', () => {
  const portfolio = { openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0 };
  const malformedVoteSets = [
    safeProposal.votes.slice(0, 4),
    safeProposal.votes.map((vote, index) => index === 4 ? { ...vote, agent: 'memory' as const } : vote),
    safeProposal.votes.map((vote, index) => index === 0 ? { ...vote, agent: 'unknown' as never } : vote),
    safeProposal.votes.map((vote, index) => index === 0 ? { ...vote, confidence: Number.NaN } : vote),
  ];
  for (const votes of malformedVoteSets) {
    const result = evaluateProposal({ ...safeProposal, votes }, portfolio);
    assert.equal(result.approved, false);
    assert.match(result.gates.find((item) => item.id === 'council')?.detail ?? '', /Invalid specialist set/);
  }
});

test('blocks invalid numeric risk evidence, including negative quote ages', () => {
  const portfolio = { openRisk: 0, openPositions: 0, dailyDrawdown: 0, competitionDrawdown: 0 };
  for (const change of [{ maxLoss: -1 }, { maxLoss: 0 }, { maxLoss: NaN }, { quoteAgeSeconds: -1 },
    { quoteAgeSeconds: Infinity }, { spreadPct: -0.1 }, { confidence: Infinity }, { confidence: 1.1 },
    { correlationSlotsAfter: 0 }]) {
    assert.equal(evaluateProposal({ ...safeProposal, ...change }, portfolio).approved, false);
  }
  for (const change of [{ openRisk: -1 }, { openPositions: -1 }, { openPositions: 0.5 },
    { dailyDrawdown: -1 }, { competitionDrawdown: -1 }]) {
    assert.equal(evaluateProposal(safeProposal, { ...portfolio, ...change }).approved, false);
  }
});
