import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentVote, RiskDecision } from '../lib/domain.ts';
import { isPaperOrderEvent } from '../lib/paper-order-contract.ts';
import {
  buildMlegExitOrderArgs,
  buildMlegOrderArgs,
  createPaperOrderEvent,
  createPaperExitEvent,
  paperClientOrderId,
  reconcilePaperExitEvent,
  reconcilePaperOrderEvent,
} from '../lib/paper-order.ts';
import type { ExitEvaluation } from '../lib/exit-policy.ts';
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
  { agent: 'catalyst', approved: true, confidence: 0.75, rationale: 'Clear' },
  { agent: 'memory', approved: true, confidence: 1, rationale: 'Confirmed' },
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
  assert.equal(event.schemaVersion, 2);
  assert.equal(isPaperOrderEvent(event), true);
  assert.equal(JSON.stringify(event).includes('broker-order-id'), false);
});

test('rejects incomplete, duplicate, or malformed specialist vote sets', () => {
  const event = createPaperOrderEvent({
    eventType: 'previewed', capturedAt: '2026-09-01T13:33:12.747Z',
    position, votes, decision, brokerStatus: 'previewed', message: 'Validated',
  });
  assert.equal(isPaperOrderEvent({ ...event, councilVotes: votes.slice(0, 4) }), false);
  assert.equal(isPaperOrderEvent({
    ...event,
    councilVotes: votes.map((vote, index) => index === 4 ? { ...vote, agent: 'memory' } : vote),
  }), false);
  assert.equal(isPaperOrderEvent({
    ...event,
    councilVotes: votes.map((vote, index) => index === 0 ? { ...vote, confidence: Number.NaN } : vote),
  }), false);
});

test('creates a separate reconciled fill event from a sanitized client id', () => {
  const source = createPaperOrderEvent({
    eventType: 'submitted', capturedAt: '2026-09-01T13:33:12.747Z',
    recordedAt: '2026-09-01T13:34:00.000Z',
    position, votes, decision, brokerStatus: 'accepted', message: 'Accepted',
  });
  const reconciled = reconcilePaperOrderEvent(source, {
    client_order_id: source.clientOrderId,
    status: 'filled',
    filled_qty: '1',
    filled_avg_price: '4.18',
  }, '2026-09-01T13:35:00.000Z');
  assert.equal(reconciled.eventType, 'reconciled');
  assert.equal(reconciled.brokerStatus, 'filled');
  assert.equal(reconciled.filledQuantity, 1);
  assert.equal(reconciled.filledAveragePrice, 4.18);
  assert.equal(isPaperOrderEvent(reconciled), true);
});

const exitEvaluation: ExitEvaluation = {
  evaluatedAt: '2026-09-03T19:00:00.000Z', reason: 'time_exit', shouldExit: true,
  entryDebit: 4.18, closeCredit: 4.5, unrealizedPnl: 32,
  profitTarget: 151, lossLimit: 209, timeExitAt: '2026-09-03T19:00:00.000Z',
  quoteAgeSeconds: 5, quoteFresh: true, positionMatched: true,
  message: 'Time exit approved',
};

test('builds one atomic closing credit order with reversed intents', () => {
  const entry = createPaperOrderEvent({
    eventType: 'reconciled', capturedAt: '2026-09-01T13:33:12.747Z',
    recordedAt: '2026-09-01T13:35:00.000Z', position, votes, decision,
    brokerStatus: 'filled', filledQuantity: 1, filledAveragePrice: 4.18, message: 'Filled',
  });
  const args = buildMlegExitOrderArgs(entry, exitEvaluation, `${entry.clientOrderId}-exit`, true);
  assert.equal(args[args.indexOf('--limit-price') + 1], '-4.50');
  assert.equal(args.includes('--dry-run'), true);
  const legs = JSON.parse(args[args.indexOf('--legs') + 1]);
  assert.deepEqual(legs.map((leg: { position_intent: string }) => leg.position_intent), [
    'sell_to_close', 'buy_to_close',
  ]);
});

test('records exit monitoring and realized P&L without broker identifiers', () => {
  const entry = createPaperOrderEvent({
    eventType: 'reconciled', capturedAt: '2026-09-01T13:33:12.747Z',
    recordedAt: '2026-09-01T13:35:00.000Z', position, votes, decision,
    brokerStatus: 'filled', filledQuantity: 1, filledAveragePrice: 4.18, message: 'Filled',
  });
  const submitted = createPaperExitEvent({
    eventType: 'exit_submitted', entry, evaluation: exitEvaluation,
    recordedAt: '2026-09-03T19:00:00.000Z', brokerStatus: 'accepted',
  });
  assert.equal(isPaperOrderEvent(submitted), true);
  const reconciled = reconcilePaperExitEvent(submitted, entry, {
    client_order_id: submitted.clientOrderId, status: 'filled', filled_qty: '1', filled_avg_price: '-4.47',
  }, '2026-09-03T19:01:00.000Z');
  assert.equal(reconciled.eventType, 'exit_reconciled');
  assert.equal(reconciled.filledAveragePrice, 4.47);
  assert.equal(reconciled.exit?.realizedPnl, 29);
  assert.equal(isPaperOrderEvent(reconciled), true);
});
