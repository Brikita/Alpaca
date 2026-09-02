import assert from 'node:assert/strict';
import test from 'node:test';
import type { PaperOrderEvent } from '../lib/paper-order.ts';
import { calculateTradePerformance } from '../lib/performance-analytics.ts';

function exitEvent(id: string, recordedAt: string, pnl: number): PaperOrderEvent {
  return {
    schemaVersion: 1, source: 'volguard-runner', mode: 'paper',
    eventKey: `${id}:exit`, eventType: 'exit_reconciled', recordedAt,
    proposalId: id, clientOrderId: `${id}-exit`, symbol: 'SPY', strategy: 'bull_call_spread',
    expiration: '2026-09-04', quantity: 1, limitDebit: 1, maxLoss: 100, maxProfit: 100,
    legs: [], councilVotes: [], riskDecision: { approved: true, passed: 0, total: 0, gates: [] },
    brokerStatus: 'filled', filledQuantity: 1, filledAveragePrice: 1,
    exit: {
      entryClientOrderId: id, reason: 'profit_target', entryDebit: 1, closeCredit: 1,
      unrealizedPnl: pnl, profitTarget: 50, lossLimit: 50, timeExitAt: recordedAt,
      quoteAgeSeconds: 1, quoteFresh: true, positionMatched: true, realizedPnl: pnl,
    },
    message: 'Closed',
  };
}

test('computes realized trading evidence and path drawdown from filled exits', () => {
  const result = calculateTradePerformance([
    exitEvent('one', '2026-09-01T10:00:00Z', 100),
    exitEvent('two', '2026-09-02T10:00:00Z', -40),
    exitEvent('three', '2026-09-03T10:00:00Z', -80),
  ]);
  assert.deepEqual(result, {
    closedTrades: 3, wins: 1, losses: 2, winRate: 33.33,
    realizedPnl: -20, expectancy: -6.67, averageWin: 100, averageLoss: -60,
    profitFactor: 0.83, maxDrawdown: 120,
  });
});

test('deduplicates reconciliations and ignores unfilled exits', () => {
  const closed = exitEvent('one', '2026-09-01T10:00:00Z', 25);
  const duplicate = { ...closed, eventKey: 'one:duplicate', recordedAt: '2026-09-01T10:01:00Z' };
  const unfilled = { ...exitEvent('two', '2026-09-02T10:00:00Z', 50), brokerStatus: 'new', filledQuantity: 0 };
  assert.equal(calculateTradePerformance([closed, duplicate, unfilled]).closedTrades, 1);
});
