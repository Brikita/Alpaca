import assert from 'node:assert/strict';
import test from 'node:test';
import type { SafePosition } from '../lib/alpaca-snapshot.ts';
import {
  correlationSlotsAfter,
  exposureGroupForSymbol,
  MAX_OPEN_STRATEGIES,
  openPortfolio,
  portfolioPositionsMatch,
} from '../lib/portfolio-positions.ts';
import { DEFAULT_OPTION_UNIVERSE } from '../lib/option-universe.ts';
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
    councilVotes: [], riskDecision: { approved: true, passed: 14, total: 14, gates: [] },
    brokerStatus: 'filled', filledQuantity: 1, filledAveragePrice: maxLoss / 100, message: 'Filled',
  };
}

test('groups reconciled spreads into strategies and sums maximum risk', () => {
  const first = entry('volguard-gld', 'GLD', 182, '2026-09-01T14:00:00Z');
  const second = entry('volguard-spy', 'SPY', 430, '2026-09-02T14:00:00Z');
  const portfolio = openPortfolio([second, first, { ...first, recordedAt: '2026-09-01T14:01:00Z' }]);
  assert.equal(portfolio.entries.length, 2);
  assert.equal(portfolio.openRisk, 612);
  assert.deepEqual([...portfolio.underlyings], ['GLD', 'SPY']);
});

test('tracks ten simultaneous strategies and their complete broker leg set', () => {
  const symbols = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'GLD', 'SLV', 'TLT'];
  const entries = symbols.map((symbol, index) => {
    const base = entry(
      `volguard-${symbol.toLowerCase()}`,
      symbol,
      400,
      new Date(Date.UTC(2026, 8, 1, 14, index)).toISOString(),
    );
    return { ...base, legs: [
      ...base.legs,
      { symbol: `${symbol}260911C00100000`, side: 'buy' as const, positionIntent: 'buy_to_open' as const, ratioQuantity: 1 },
      { symbol: `${symbol}260911C00105000`, side: 'sell' as const, positionIntent: 'sell_to_open' as const, ratioQuantity: 1 },
    ] };
  });
  const portfolio = openPortfolio(entries);
  const positions: SafePosition[] = entries.flatMap((item) => item.legs.map((leg) => ({
    symbol: leg.symbol,
    assetClass: 'us_option' as const,
    quantity: leg.side === 'buy' ? 1 : -1,
    side: leg.side === 'buy' ? 'long' as const : 'short' as const,
    marketValue: 0,
    costBasis: 0,
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
  })));
  assert.equal(portfolio.entries.length, 10);
  assert.equal(portfolio.openRisk, 4_000);
  assert.equal(positions.length, 40);
  assert.equal(portfolioPositionsMatch(portfolio.entries, positions), true);
});

test('counts correlation within exposure groups instead of treating the whole portfolio as one cluster', () => {
  const entries = [
    entry('volguard-spy', 'SPY', 300, '2026-09-01T14:00:00Z'),
    entry('volguard-qqq', 'QQQ', 300, '2026-09-01T14:01:00Z'),
    entry('volguard-xlf', 'XLF', 300, '2026-09-01T14:02:00Z'),
  ];
  assert.equal(exposureGroupForSymbol('dia'), 'broad-equity');
  assert.equal(correlationSlotsAfter(entries, 'DIA'), 3);
  assert.equal(correlationSlotsAfter(entries, 'XLK'), 2);
  assert.equal(correlationSlotsAfter(entries, 'GLD'), 1);
});

test('the default watchlist can supply ten unique, classified underlyings', () => {
  assert.ok(DEFAULT_OPTION_UNIVERSE.length > MAX_OPEN_STRATEGIES);
  for (const symbol of DEFAULT_OPTION_UNIVERSE) {
    assert.notEqual(exposureGroupForSymbol(symbol), 'other');
  }
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
