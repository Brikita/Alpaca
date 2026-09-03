import assert from 'node:assert/strict';
import test from 'node:test';
import type { SafePosition } from '../lib/alpaca-snapshot.ts';
import { evaluateExit, timeExitAt, type OptionQuote } from '../lib/exit-policy.ts';
import { createPaperExitEvent, reconcilePaperOrderEvent, type PaperOrderEvent } from '../lib/paper-order.ts';
import { isPaperOrderEvent } from '../lib/paper-order-contract.ts';
import type { MarketCalendarSession } from '../lib/market-calendar.ts';

const entry: PaperOrderEvent = {
  schemaVersion: 1, source: 'volguard-runner', mode: 'paper',
  eventKey: 'volguard-gld-entry:reconciled:filled:1', eventType: 'reconciled',
  recordedAt: '2026-09-01T14:25:00.000Z', proposalId: 'gld-spread',
  clientOrderId: 'volguard-gld-entry', symbol: 'GLD', strategy: 'bear_put_spread',
  expiration: '2026-09-04', quantity: 1, limitDebit: 1.82, maxLoss: 182, maxProfit: 518,
  legs: [
    { symbol: 'GLD260904P00398000', side: 'buy', positionIntent: 'buy_to_open', ratioQuantity: 1 },
    { symbol: 'GLD260904P00391000', side: 'sell', positionIntent: 'sell_to_open', ratioQuantity: 1 },
  ],
  councilVotes: [
    { agent: 'regime', approved: true, confidence: 0.8, rationale: 'Aligned' },
    { agent: 'volatility', approved: true, confidence: 0.8, rationale: 'Edge' },
    { agent: 'catalyst', approved: false, confidence: 0.4, rationale: 'Historical entry: no verified feed' },
    { agent: 'red_team', approved: true, confidence: 0.8, rationale: 'No veto' },
  ],
  riskDecision: { approved: true, passed: 1, total: 1, gates: [{ id: 'all', label: 'All', passed: true, detail: 'Passed' }] },
  brokerStatus: 'filled', filledQuantity: 1, filledAveragePrice: 1.79, message: 'Filled',
};

const positions: SafePosition[] = [
  { symbol: entry.legs[0].symbol, assetClass: 'us_option', quantity: 1, side: 'long', marketValue: 0, costBasis: 0, unrealizedPnl: 0, unrealizedPnlPct: 0 },
  { symbol: entry.legs[1].symbol, assetClass: 'us_option', quantity: -1, side: 'short', marketValue: 0, costBasis: 0, unrealizedPnl: 0, unrealizedPnlPct: 0 },
];

function quotes(longBid: number, shortAsk: number, timestamp = '2026-09-01T16:37:40.000Z'): Record<string, OptionQuote> {
  return {
    [entry.legs[0].symbol]: { bidPrice: longBid, askPrice: longBid + 0.1, timestamp },
    [entry.legs[1].symbol]: { bidPrice: Math.max(0.01, shortAsk - 0.1), askPrice: shortAsk, timestamp },
  };
}

test('sets a 3pm ET exit on the prior weekday', () => {
  assert.equal(timeExitAt('2026-09-04'), '2026-09-03T19:00:00.000Z');
});

test('uses the verified prior session and its early close', () => {
  const calendar: MarketCalendarSession[] = [
    { date: '2026-11-25', open: '09:30', close: '16:00', sessionOpen: '0930', sessionClose: '1600' },
    { date: '2026-11-27', open: '09:30', close: '13:00', sessionOpen: '0930', sessionClose: '1300' },
  ];
  assert.equal(timeExitAt('2026-11-30', calendar), '2026-11-27T17:00:00.000Z');
});

test('holds while profit, loss, and time thresholds remain untouched', () => {
  const result = evaluateExit({
    entry, positions, quotes: quotes(3.17, 1.22), now: '2026-09-01T16:37:45.000Z',
  });
  assert.equal(result.closeCredit, 1.95);
  assert.equal(result.unrealizedPnl, 16);
  assert.equal(result.profitTarget, 260.5);
  assert.equal(result.lossLimit, 89.5);
  assert.equal(result.reason, 'hold');
  assert.equal(result.shouldExit, false);
});

test('preserves four-vote historical evidence for monitoring, closing, and reconciliation only', () => {
  const evaluation = evaluateExit({
    entry, positions, quotes: quotes(5.5, 1), now: '2026-09-01T16:37:45.000Z',
  });
  for (const eventType of ['monitored', 'exit_previewed', 'exit_submitted', 'exit_rejected'] as const) {
    const event = createPaperExitEvent({ eventType, entry, evaluation, brokerStatus: 'accepted' });
    assert.equal(event.schemaVersion, 1);
    assert.deepEqual(event.councilVotes, entry.councilVotes);
    assert.equal(event.councilVotes.some((vote) => vote.agent === 'memory'), false);
    assert.equal(isPaperOrderEvent(event), true);
  }
  assert.equal(isPaperOrderEvent(reconcilePaperOrderEvent(entry, {
    status: 'filled', filled_qty: '1', filled_avg_price: '1.79',
  })), true);
  for (const eventType of ['previewed', 'submitted', 'rejected']) {
    assert.equal(isPaperOrderEvent({ ...entry, eventType }), false);
  }
  assert.equal(isPaperOrderEvent({ ...entry, schemaVersion: 2 }), false);
});

test('approves a fresh matched spread when the profit target is reached', () => {
  const result = evaluateExit({
    entry, positions, quotes: quotes(5.5, 1.0), now: '2026-09-01T16:37:45.000Z',
  });
  assert.equal(result.reason, 'profit_target');
  assert.equal(result.shouldExit, true);
});

test('fails closed when a trigger uses stale quotes or unmatched positions', () => {
  const stale = evaluateExit({
    entry, positions, quotes: quotes(5.5, 1, '2026-09-01T16:35:00.000Z'), now: '2026-09-01T16:37:45.000Z',
  });
  assert.equal(stale.reason, 'profit_target');
  assert.equal(stale.shouldExit, false);
  assert.equal(stale.quoteFresh, false);

  const unmatched = evaluateExit({
    entry, positions: positions.slice(0, 1), quotes: quotes(5.5, 1), now: '2026-09-01T16:37:45.000Z',
  });
  assert.equal(unmatched.shouldExit, false);
  assert.equal(unmatched.positionMatched, false);
});

test('rejects invalid and future exit quotes instead of clamping their age to zero', () => {
  for (const timestamp of ['invalid', '2026-09-01T16:38:00.000Z']) {
    assert.throws(() => evaluateExit({ entry, positions, quotes: quotes(5.5, 1, timestamp),
      now: '2026-09-01T16:37:45.000Z' }), /valid non-future quote timestamp/);
  }
});
