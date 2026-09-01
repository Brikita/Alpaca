import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentVote, RiskDecision } from '../lib/domain.ts';
import { isPaperOrderEvent } from '../lib/paper-order-contract.ts';
import { buildMlegOrderArgs, createPaperOrderEvent, paperClientOrderId } from '../lib/paper-order.ts';
import type { ConstructedPosition } from '../lib/position-constructor.ts';

const position: ConstructedPosition = {
  id: 'GLD-2026-09-04-404-bear_put_spread', symbol: 'GLD',
  strategy: 'bear_put_spread', sourceStrategy: 'bear_put_spread',
  expiration: '2026-09-04', quantity: 1,
  legs: [
    { symbol: 'GLD260904P00404000', type: 'put', strike: 404, side: 'buy', quantity: 1, midpoint: 7, limitPrice: 7.19 },
    { symbol: 'GLD260904P00397000', type: 'put', strike: 397, side: 'sell', quantity: 1, midpoint: 3, limitPrice: 2.89 },
  ],
  netDebit: 4.3, maxLoss: 430, maxProfit: 270, riskBudget: 500,
  optimized: true, pricingBasis: 'buy-ask-sell-bid', rationale: 'Covered',
  definedRisk: true, nakedShort: false, expiresToday: false,
  spreadPct: 0.0924, quoteAgeSeconds: 9, confidence: 0.75,
};

const votes: AgentVote[] = [
  { agent: 'regime', approved: true, confidence: 0.75, rationale: 'Aligned' },
  { agent: 'volatility', approved: true, confidence: 0.75, rationale: 'Edge' },
  { agent: 'catalyst', approved: false, confidence: 0, rationale: 'No feed' },
  { agent: 'red_team', approved: true, confidence: 0.75, rationale: 'No veto' },
];
const decision: RiskDecision = {
  approved: true, passed: 1, total: 1,
  gates: [{ id: 'all', label: 'All', passed: true, detail: 'Passed' }],
};

test('builds one atomic debit-limit mleg dry run with opening intents', () => {
  const id = paperClientOrderId(position, '2026-09-01T13:33:12.747Z');
  const args = buildMlegOrderArgs(position, id, true);
  assert.deepEqual(args.slice(0, 2), ['order', 'submit']);
  assert.equal(args.includes('--dry-run'), true);
  assert.equal(args[args.indexOf('--order-class') + 1], 'mleg');
  assert.equal(args[args.indexOf('--limit-price') + 1], '4.30');
  const legs = JSON.parse(args[args.indexOf('--legs') + 1]);
  assert.deepEqual(legs.map((leg: { position_intent: string }) => leg.position_intent), [
    'buy_to_open', 'sell_to_open',
  ]);
});

test('rejects an order that exceeds the $500 maximum-loss policy', () => {
  assert.throws(
    () => buildMlegOrderArgs({ ...position, maxLoss: 501 }, 'volguard-test', true),
    /maximum-loss policy/,
  );
});

test('creates a sanitized, idempotent event without a broker order id', () => {
  const event = createPaperOrderEvent({
    eventType: 'previewed', capturedAt: '2026-09-01T13:33:12.747Z',
    recordedAt: '2026-09-01T13:34:00.000Z',
    position, votes, decision, brokerStatus: 'previewed', message: 'Validated',
  });
  assert.equal(event.eventKey, `${event.clientOrderId}:previewed`);
  assert.equal(isPaperOrderEvent(event), true);
  assert.equal(JSON.stringify(event).includes('broker-order-id'), false);
});
