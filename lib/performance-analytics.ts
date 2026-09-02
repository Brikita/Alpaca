import type { PaperOrderEvent } from './paper-order.ts';

export interface TradePerformance {
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  realizedPnl: number;
  expectancy: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTradePerformance(events: PaperOrderEvent[]): TradePerformance {
  const closed = [...new Map(events
    .filter((event) => event.eventType === 'exit_reconciled'
      && event.brokerStatus === 'filled'
      && event.filledQuantity > 0
      && event.exit?.realizedPnl !== null
      && event.exit?.realizedPnl !== undefined)
    .map((event) => [event.exit!.entryClientOrderId, event])).values()]
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const pnls = closed.map((event) => event.exit!.realizedPnl!);
  const wins = pnls.filter((value) => value > 0);
  const losses = pnls.filter((value) => value < 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const pnl of pnls) {
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const realizedPnl = pnls.reduce((sum, value) => sum + value, 0);
  return {
    closedTrades: pnls.length,
    wins: wins.length,
    losses: losses.length,
    winRate: pnls.length ? round((wins.length / pnls.length) * 100) : null,
    realizedPnl: round(realizedPnl),
    expectancy: pnls.length ? round(realizedPnl / pnls.length) : null,
    averageWin: wins.length ? round(grossProfit / wins.length) : null,
    averageLoss: losses.length ? round(-grossLoss / losses.length) : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : grossProfit > 0 ? null : null,
    maxDrawdown: round(maxDrawdown),
  };
}
