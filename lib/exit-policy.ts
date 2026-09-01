import type { SafePosition } from './alpaca-snapshot.ts';
import type { PaperOrderEvent } from './paper-order.ts';

export const DEFAULT_EXIT_POLICY = {
  profitCapturePct: 0.5,
  stopLossPctOfDebit: 0.5,
  timeExitHourEt: 15,
  maxQuoteAgeSeconds: 60,
} as const;

export type ExitReason = 'profit_target' | 'loss_limit' | 'time_exit' | 'hold';

export interface OptionQuote {
  bidPrice: number;
  askPrice: number;
  timestamp: string;
}

export interface ExitEvaluation {
  evaluatedAt: string;
  reason: ExitReason;
  shouldExit: boolean;
  entryDebit: number;
  closeCredit: number;
  unrealizedPnl: number;
  profitTarget: number;
  lossLimit: number;
  timeExitAt: string;
  quoteAgeSeconds: number;
  quoteFresh: boolean;
  positionMatched: boolean;
  message: string;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function previousWeekday(expiration: string): string {
  const date = new Date(`${expiration}T12:00:00.000Z`);
  do date.setUTCDate(date.getUTCDate() - 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function newYorkWallTimeToUtc(date: string, hour: number, minute = 0): string {
  const [year, month, day] = date.split('-').map(Number);
  const provisional = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(provisional))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const represented = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second,
  );
  const offset = represented - provisional;
  return new Date(provisional - offset).toISOString();
}

export function timeExitAt(expiration: string): string {
  return newYorkWallTimeToUtc(
    previousWeekday(expiration),
    DEFAULT_EXIT_POLICY.timeExitHourEt,
  );
}

export function matchedEntryPositions(
  entry: PaperOrderEvent,
  positions: SafePosition[],
): boolean {
  return entry.legs.every((leg) => {
    const position = positions.find((item) => item.symbol === leg.symbol);
    if (!position || Math.abs(position.quantity) < entry.quantity) return false;
    return leg.positionIntent === 'buy_to_open'
      ? position.quantity > 0
      : position.quantity < 0;
  });
}

export function evaluateExit(input: {
  entry: PaperOrderEvent;
  positions: SafePosition[];
  quotes: Record<string, OptionQuote>;
  now?: string;
}): ExitEvaluation {
  const now = input.now ?? new Date().toISOString();
  if (input.entry.eventType !== 'reconciled'
    || input.entry.brokerStatus !== 'filled'
    || input.entry.filledQuantity <= 0
    || input.entry.filledAveragePrice === null
  ) {
    throw new Error('A reconciled filled entry is required before exit evaluation.');
  }

  const positionMatched = matchedEntryPositions(input.entry, input.positions);
  const quoteValues = input.entry.legs.map((leg) => {
    const quote = input.quotes[leg.symbol];
    if (!quote || quote.bidPrice <= 0 || quote.askPrice <= 0 || quote.askPrice < quote.bidPrice) {
      throw new Error(`A valid two-sided quote is required for ${leg.symbol}.`);
    }
    return { leg, quote };
  });
  const closeCredit = round(quoteValues.reduce((total, { leg, quote }) => (
    total + (leg.positionIntent === 'buy_to_open' ? quote.bidPrice : -quote.askPrice)
  ), 0));
  if (closeCredit <= 0) throw new Error('The conservative closing quote does not produce a positive credit.');

  const nowMs = new Date(now).getTime();
  const quoteAgeSeconds = Math.max(...quoteValues.map(({ quote }) => (
    Math.max(0, (nowMs - new Date(quote.timestamp).getTime()) / 1000)
  )));
  const quoteFresh = quoteAgeSeconds <= DEFAULT_EXIT_POLICY.maxQuoteAgeSeconds;
  const entryDebit = input.entry.filledAveragePrice;
  const unrealizedPnl = round((closeCredit - entryDebit) * 100 * input.entry.quantity);
  const actualMaxProfit = input.entry.maxProfit === null
    ? 0
    : input.entry.maxProfit + (input.entry.limitDebit - entryDebit) * 100 * input.entry.quantity;
  const profitTarget = round(actualMaxProfit * DEFAULT_EXIT_POLICY.profitCapturePct);
  const lossLimit = round(entryDebit * 100 * input.entry.quantity * DEFAULT_EXIT_POLICY.stopLossPctOfDebit);
  const exitAt = timeExitAt(input.entry.expiration);

  let reason: ExitReason = 'hold';
  if (unrealizedPnl >= profitTarget && profitTarget > 0) reason = 'profit_target';
  else if (unrealizedPnl <= -lossLimit) reason = 'loss_limit';
  else if (nowMs >= new Date(exitAt).getTime()) reason = 'time_exit';

  const triggerReached = reason !== 'hold';
  const shouldExit = triggerReached && quoteFresh && positionMatched;
  const message = !positionMatched
    ? 'Exit blocked: the broker positions do not exactly match the recorded spread.'
    : !quoteFresh
      ? `Exit blocked: the oldest option quote is ${Math.ceil(quoteAgeSeconds)} seconds old.`
      : reason === 'profit_target'
        ? `Exit approved: unrealized profit ${round(unrealizedPnl)} reached the ${profitTarget} target.`
        : reason === 'loss_limit'
          ? `Exit approved: unrealized loss ${round(Math.abs(unrealizedPnl))} reached the ${lossLimit} limit.`
          : reason === 'time_exit'
            ? 'Exit approved: the position reached its pre-expiration time stop.'
            : `Hold: unrealized P&L is ${round(unrealizedPnl)}; no deterministic exit threshold has been reached.`;

  return {
    evaluatedAt: now,
    reason,
    shouldExit,
    entryDebit,
    closeCredit,
    unrealizedPnl,
    profitTarget,
    lossLimit,
    timeExitAt: exitAt,
    quoteAgeSeconds,
    quoteFresh,
    positionMatched,
    message,
  };
}
