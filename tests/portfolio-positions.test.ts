import assert from 'node:assert/strict';
import test from 'node:test';
import type { SafePosition } from '../lib/alpaca-snapshot.ts';
import { openPortfolio, portfolioPositionsMatch } from '../lib/portfolio-positions.ts';
import type { PaperOrderEvent } from '../lib/paper-order.ts';

function entry(clientOrderId: string, symbol: string, maxLoss: number, recordedAt: string): PaperOrderEvent {
  return {
    schemaVersion: 1, source: 'volguard-runner', mode: 'paper',
    eventKey: `${clientOrderId}:reconciled:filled:1`, eventType: 'reconciled', recordedAt,
    proposalId: `${symbol}-proposal`, clientOrderId, symbol, strategy: 'bear_put_spread',
    expiration: '2026-09-11', quantity: 1, limitDebit: maxLoss / 100, maxLoss, maxProfit: 200,
    legs: [
      { symbol: `${symbol}260911P00100000`, side: 'buy', positionIntent: 'buy_to_open', ratioQuantity: 1 },
      { symbol: `${symbol}260911P00095000`, side: 'sell', positionIntent: 'sell_to_open', ratioQuantity: 1 },
    ],
    councilVotes: [], riskDecision: { approved: true, passed: 13, total: 13, gates: [] },
    brokerStatus: 'filled', filledQuantity: 1, filledAveragePrice: maxLoss / 100, message: 'Filled',
  };
}

test('groups two reconciled spreads into two strategies and sums maximum risk', () => {
  const first = entry('volguard-gld', 'GLD', 182, '2026-09-01T14:00:00Z');
  const second = entry('volguard-spy', 'SPY', 430, '2026-09-02T14:00:00Z');
  const portfolio = openPortfolio([second, first, { ...first, recordedAt: '2026-09-01T14:01:00Z' }]);
  assert.equal(portfolio.entries.length, 2);
  assert.equal(portfolio.openRisk, 612);
  assert.deepEqual([...portfolio.underlyings], ['GLD', 'SPY']);
});

test('removes only the strategy whose exit fill is reconciled', () => {
  const first = entry('volguard-gld', 'GLD', 182, '2026-09-01T14:00:00Z');
  const second = entry('volguard-spy', 'SPY', 430, '2026-09-02T14:00:00Z');
  const closed = {
    ...first, eventKey: 'volguard-gld-exit:exit_reconciled:filled:1', clientOrderId: 'volguard-gld-exit',
    eventType: 'exit_reconciled' as const, exit: {
      entryClientOrderId: first.clientOrderId, evaluatedAt: '2026-09-03T19:00:00Z', reason: 'time_exit' as const,
      entryDebit: 1.82, closeCredit: 2, unrealizedPnl: 18, profitTarget: 159, lossLimit: 91,
      timeExitAt: '2026-09-03T19:00:00Z', quoteAgeSeconds: 1, quoteFresh: true,
      positionMatched: true, realizedPnl: 18,
    },
  };
  assert.deepEqual(openPortfolio([first, second, closed]).entries.map((item) => item.symbol), ['SPY']);
});

test('requires the complete broker option-leg set to match the portfolio ledger', () => {
  const first = entry('volguard-gld', 'GLD', 182, '2026-09-01T14:00:00Z');
  const positions: SafePosition[] = first.legs.map((leg) => ({
    symbol: leg.symbol, assetClass: 'us_option', quantity: leg.side === 'buy' ? 1 : -1,
    side: leg.side === 'buy' ? 'long' : 'short', marketValue: 0, costBasis: 0,
    unrealizedPnl: 0, unrealizedPnlPct: 0,
  }));
  assert.equal(portfolioPositionsMatch([first], positions), true);
  assert.equal(portfolioPositionsMatch([first], positions.slice(0, 1)), false);
});
