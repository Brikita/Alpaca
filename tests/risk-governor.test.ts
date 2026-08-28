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
    { agent: 'catalyst', approved: false, confidence: 0.62, rationale: 'Macro event' },
    { agent: 'red_team', approved: true, confidence: 0.71, rationale: 'Risk is defined' },
  ],
};

test('approves a proposal that passes every deterministic gate', () => {
  const result = evaluateProposal(safeProposal, {
    openRisk: 920, dailyDrawdown: 180, competitionDrawdown: 0,
  });
  assert.equal(result.approved, true);
  assert.equal(result.passed, 12);
});

test('blocks a trade that breaches per-trade and portfolio limits', () => {
  const result = evaluateProposal(
    { ...safeProposal, maxLoss: 900 },
    { openRisk: 2_500, dailyDrawdown: 180, competitionDrawdown: 0 },
  );
  assert.equal(result.approved, false);
  assert.equal(result.gates.find((item) => item.id === 'trade-risk')?.passed, false);
  assert.equal(result.gates.find((item) => item.id === 'portfolio-risk')?.passed, false);
});
