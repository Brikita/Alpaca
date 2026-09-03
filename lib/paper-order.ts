import type { AgentVote, RiskDecision } from './domain.ts';
import { DEFAULT_RISK_POLICY } from './domain.ts';
import { runAlpaca, type AlpacaEnvironment } from './alpaca-cli.ts';
import type { ExitEvaluation, ExitReason } from './exit-policy.ts';
import type { ConstructedPosition } from './position-constructor.ts';

export type PaperOrderEventType =
  | 'previewed'
  | 'submitted'
  | 'rejected'
  | 'reconciled'
  | 'monitored'
  | 'exit_previewed'
  | 'exit_submitted'
  | 'exit_rejected'
  | 'exit_reconciled';

export interface PaperExitEvidence {
  entryClientOrderId: string;
  reason: ExitReason;
  entryDebit: number;
  closeCredit: number;
  unrealizedPnl: number;
  profitTarget: number;
  lossLimit: number;
  timeExitAt: string;
  quoteAgeSeconds: number;
  quoteFresh: boolean;
  positionMatched: boolean;
  realizedPnl: number | null;
}

export interface PaperOrderEvent {
  schemaVersion: 1 | 2;
  source: 'volguard-runner';
  mode: 'paper';
  eventKey: string;
  eventType: PaperOrderEventType;
  recordedAt: string;
  proposalId: string;
  clientOrderId: string;
  symbol: string;
  strategy: ConstructedPosition['strategy'];
  expiration: string;
  quantity: number;
  limitDebit: number;
  maxLoss: number;
  maxProfit: number | null;
  legs: Array<{
    symbol: string;
    side: 'buy' | 'sell';
    positionIntent: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close';
    ratioQuantity: number;
  }>;
  councilVotes: AgentVote[];
  riskDecision: RiskDecision;
  brokerStatus: string;
  filledQuantity: number;
  filledAveragePrice: number | null;
  exit?: PaperExitEvidence;
  message: string;
}

export interface AlpacaOrderResponse {
  client_order_id?: string;
  status?: string;
  submitted_at?: string;
  order_class?: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
}

export function paperClientOrderId(position: ConstructedPosition, capturedAt: string): string {
  const timestamp = capturedAt.replace(/[^0-9]/g, '').slice(0, 14);
  return `volguard-${position.symbol.toLowerCase()}-${timestamp}-${position.strategy.replaceAll('_', '-')}`
    .slice(0, 64);
}

export function buildMlegOrderArgs(
  position: ConstructedPosition,
  clientOrderId: string,
  dryRun: boolean,
): string[] {
  if (position.legs.length < 2 || position.legs.length > 4) {
    throw new Error('A multi-leg order requires two to four legs.');
  }
  if (new Set(position.legs.map((leg) => leg.symbol)).size !== position.legs.length) {
    throw new Error('Every multi-leg contract symbol must be unique.');
  }
  if (position.legs.some((leg) => leg.quantity !== position.quantity)) {
    throw new Error('Every covered leg must use the same strategy quantity.');
  }
  if (position.maxLoss > DEFAULT_RISK_POLICY.maxLossPerTrade) {
    throw new Error('The order exceeds the maximum-loss policy.');
  }

  const legs = position.legs.map((leg) => ({
    symbol: leg.symbol,
    ratio_qty: '1',
    side: leg.side,
    position_intent: leg.side === 'buy' ? 'buy_to_open' : 'sell_to_open',
  }));
  const args = [
    'order', 'submit',
    '--qty', String(position.quantity),
    '--type', 'limit',
    '--limit-price', position.netDebit.toFixed(2),
    '--time-in-force', 'day',
    '--order-class', 'mleg',
    '--client-order-id', clientOrderId,
    '--legs', JSON.stringify(legs),
  ];
  if (dryRun) args.push('--dry-run');
  return args;
}

export function exitClientOrderId(entryClientOrderId: string): string {
  return `${entryClientOrderId}-exit`.slice(0, 64);
}

export function buildMlegExitOrderArgs(
  entry: PaperOrderEvent,
  evaluation: ExitEvaluation,
  clientOrderId: string,
  dryRun: boolean,
): string[] {
  if (!evaluation.shouldExit) {
    throw new Error('A deterministic, fresh, position-matched exit trigger is required.');
  }
  if (entry.legs.length < 2 || entry.legs.length > 4) {
    throw new Error('A multi-leg exit requires two to four recorded entry legs.');
  }
  const legs = entry.legs.map((leg) => {
    if (leg.positionIntent === 'buy_to_open') {
      return { symbol: leg.symbol, ratio_qty: '1', side: 'sell', position_intent: 'sell_to_close' };
    }
    if (leg.positionIntent === 'sell_to_open') {
      return { symbol: leg.symbol, ratio_qty: '1', side: 'buy', position_intent: 'buy_to_close' };
    }
    throw new Error('Exit construction requires opening intents on the recorded entry.');
  });
  const args = [
    'order', 'submit',
    '--qty', String(entry.quantity),
    '--type', 'limit',
    '--limit-price', (-evaluation.closeCredit).toFixed(2),
    '--time-in-force', 'day',
    '--order-class', 'mleg',
    '--client-order-id', clientOrderId,
    '--legs', JSON.stringify(legs),
  ];
  if (dryRun) args.push('--dry-run');
  return args;
}

function exitEvidence(
  entry: PaperOrderEvent,
  evaluation: ExitEvaluation,
  realizedPnl: number | null = null,
): PaperExitEvidence {
  return {
    entryClientOrderId: entry.clientOrderId,
    reason: evaluation.reason,
    entryDebit: evaluation.entryDebit,
    closeCredit: evaluation.closeCredit,
    unrealizedPnl: evaluation.unrealizedPnl,
    profitTarget: evaluation.profitTarget,
    lossLimit: evaluation.lossLimit,
    timeExitAt: evaluation.timeExitAt,
    quoteAgeSeconds: evaluation.quoteAgeSeconds,
    quoteFresh: evaluation.quoteFresh,
    positionMatched: evaluation.positionMatched,
    realizedPnl,
  };
}

export function createPaperExitEvent(input: {
  eventType: Extract<PaperOrderEventType, 'monitored' | 'exit_previewed' | 'exit_submitted' | 'exit_rejected'>;
  entry: PaperOrderEvent;
  evaluation: ExitEvaluation;
  recordedAt?: string;
  brokerStatus: string;
  filledQuantity?: number;
  filledAveragePrice?: number | null;
  message?: string;
}): PaperOrderEvent {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const isMonitor = input.eventType === 'monitored';
  const clientOrderId = isMonitor
    ? input.entry.clientOrderId
    : exitClientOrderId(input.entry.clientOrderId);
  return {
    ...input.entry,
    eventKey: isMonitor
      ? `${input.entry.clientOrderId}:monitored:${input.evaluation.reason}:${Math.trunc(input.evaluation.unrealizedPnl / 25)}`
      : `${clientOrderId}:${input.eventType}`,
    eventType: input.eventType,
    recordedAt,
    clientOrderId,
    legs: input.entry.legs.map((leg) => ({
      symbol: leg.symbol,
      side: leg.positionIntent === 'buy_to_open' ? 'sell' : 'buy',
      positionIntent: leg.positionIntent === 'buy_to_open' ? 'sell_to_close' : 'buy_to_close',
      ratioQuantity: leg.ratioQuantity,
    })),
    brokerStatus: input.brokerStatus,
    filledQuantity: input.filledQuantity ?? 0,
    filledAveragePrice: input.filledAveragePrice ?? null,
    exit: exitEvidence(input.entry, input.evaluation),
    message: input.message ?? input.evaluation.message,
  };
}

export function reconcilePaperExitEvent(
  source: PaperOrderEvent,
  entry: PaperOrderEvent,
  brokerOrder: AlpacaOrderResponse,
  recordedAt = new Date().toISOString(),
): PaperOrderEvent {
  if (!source.exit) throw new Error('Exit evidence is required for exit reconciliation.');
  const brokerStatus = brokerOrder.status ?? 'unknown';
  const filledQuantity = number(brokerOrder.filled_qty);
  const parsedAverage = brokerOrder.filled_avg_price === null
    ? null
    : Math.abs(number(brokerOrder.filled_avg_price));
  const filledAveragePrice = parsedAverage && parsedAverage > 0 ? parsedAverage : null;
  const realizedPnl = filledAveragePrice === null
    ? null
    : Math.round(((filledAveragePrice - source.exit.entryDebit) * 100 * filledQuantity + Number.EPSILON) * 100) / 100;
  return {
    ...source,
    eventKey: `${source.clientOrderId}:exit_reconciled:${brokerStatus}:${filledQuantity}`,
    eventType: 'exit_reconciled',
    recordedAt,
    brokerStatus,
    filledQuantity,
    filledAveragePrice,
    exit: { ...source.exit, realizedPnl },
    message: filledQuantity > 0
      ? `Broker reconciliation reports ${filledQuantity} spread closed${filledAveragePrice === null ? '' : ` for a $${filledAveragePrice} credit`}${realizedPnl === null ? '' : ` and ${realizedPnl >= 0 ? '$' : '-$'}${Math.abs(realizedPnl)} realized P&L`}.`
      : `Broker reconciliation reports exit status ${brokerStatus} with no filled quantity yet.`,
  };
}

export async function runPaperExit(
  entry: PaperOrderEvent,
  evaluation: ExitEvaluation,
  dryRun: boolean,
  environment: AlpacaEnvironment = process.env,
): Promise<PaperOrderEvent> {
  const clientOrderId = exitClientOrderId(entry.clientOrderId);
  const result = await runAlpaca<AlpacaOrderResponse>(
    buildMlegExitOrderArgs(entry, evaluation, clientOrderId, dryRun),
    { ...environment, ALPACA_LIVE_TRADE: 'false' },
  );
  const filledAveragePrice = dryRun || !result.data.filled_avg_price
    ? null
    : Math.abs(number(result.data.filled_avg_price));
  return createPaperExitEvent({
    eventType: dryRun ? 'exit_previewed' : 'exit_submitted',
    entry,
    evaluation,
    brokerStatus: dryRun ? 'previewed' : result.data.status ?? 'submitted',
    filledQuantity: dryRun ? 0 : number(result.data.filled_qty),
    filledAveragePrice,
    message: dryRun
      ? 'Alpaca CLI validated the atomic closing order without submission.'
      : `Alpaca paper API accepted the atomic closing order at a $${evaluation.closeCredit.toFixed(2)} credit limit.`,
  });
}

export function createPaperOrderEvent(input: {
  eventType: PaperOrderEventType;
  recordedAt?: string;
  capturedAt: string;
  position: ConstructedPosition;
  votes: AgentVote[];
  decision: RiskDecision;
  brokerStatus: string;
  filledQuantity?: number;
  filledAveragePrice?: number | null;
  message: string;
}): PaperOrderEvent {
  const clientOrderId = paperClientOrderId(input.position, input.capturedAt);
  return {
    schemaVersion: 2,
    source: 'volguard-runner',
    mode: 'paper',
    eventKey: `${clientOrderId}:${input.eventType}`,
    eventType: input.eventType,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    proposalId: input.position.id,
    clientOrderId,
    symbol: input.position.symbol,
    strategy: input.position.strategy,
    expiration: input.position.expiration,
    quantity: input.position.quantity,
    limitDebit: input.position.netDebit,
    maxLoss: input.position.maxLoss,
    maxProfit: input.position.maxProfit,
    legs: input.position.legs.map((leg) => ({
      symbol: leg.symbol,
      side: leg.side,
      positionIntent: leg.side === 'buy' ? 'buy_to_open' : 'sell_to_open',
      ratioQuantity: 1,
    })),
    councilVotes: input.votes,
    riskDecision: input.decision,
    brokerStatus: input.brokerStatus,
    filledQuantity: input.filledQuantity ?? 0,
    filledAveragePrice: input.filledAveragePrice ?? null,
    message: input.message,
  };
}

function number(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function reconcilePaperOrderEvent(
  source: PaperOrderEvent,
  brokerOrder: AlpacaOrderResponse,
  recordedAt = new Date().toISOString(),
): PaperOrderEvent {
  const brokerStatus = brokerOrder.status ?? 'unknown';
  const filledQuantity = number(brokerOrder.filled_qty);
  const parsedAverage = brokerOrder.filled_avg_price === null
    ? null
    : number(brokerOrder.filled_avg_price);
  const filledAveragePrice = parsedAverage && parsedAverage > 0 ? parsedAverage : null;
  return {
    ...source,
    eventKey: `${source.clientOrderId}:reconciled:${brokerStatus}:${filledQuantity}`,
    eventType: 'reconciled',
    recordedAt,
    brokerStatus,
    filledQuantity,
    filledAveragePrice,
    message: filledQuantity > 0
      ? `Broker reconciliation reports ${filledQuantity} strategy unit filled${filledAveragePrice === null ? '' : ` at $${filledAveragePrice}`}.`
      : `Broker reconciliation reports order status ${brokerStatus} with no filled quantity yet.`,
  };
}

export async function reconcilePaperOrder(
  source: PaperOrderEvent,
  environment: AlpacaEnvironment = process.env,
): Promise<PaperOrderEvent | null> {
  const result = await runAlpaca<AlpacaOrderResponse[]>([
    'order', 'list', '--status', 'all', '--nested', '--limit', '100',
  ], { ...environment, ALPACA_LIVE_TRADE: 'false' });
  const brokerOrder = result.data.find((order) => order.client_order_id === source.clientOrderId);
  return brokerOrder ? reconcilePaperOrderEvent(source, brokerOrder) : null;
}

export async function runPaperOrder(
  position: ConstructedPosition,
  capturedAt: string,
  votes: AgentVote[],
  decision: RiskDecision,
  dryRun: boolean,
  environment: AlpacaEnvironment = process.env,
): Promise<PaperOrderEvent> {
  if (!decision.approved || decision.passed !== decision.total) {
    throw new Error('Paper order blocked because the proposal did not pass every risk gate.');
  }
  const clientOrderId = paperClientOrderId(position, capturedAt);
  const result = await runAlpaca<AlpacaOrderResponse>(
    buildMlegOrderArgs(position, clientOrderId, dryRun),
    { ...environment, ALPACA_LIVE_TRADE: 'false' },
  );
  return createPaperOrderEvent({
    eventType: dryRun ? 'previewed' : 'submitted',
    capturedAt,
    position,
    votes,
    decision,
    brokerStatus: dryRun ? 'previewed' : result.data.status ?? 'submitted',
    filledQuantity: dryRun ? 0 : number(result.data.filled_qty),
    filledAveragePrice: dryRun || !result.data.filled_avg_price
      ? null
      : number(result.data.filled_avg_price),
    message: dryRun
      ? 'Alpaca CLI validated the atomic multi-leg request without submission.'
      : `Alpaca paper API accepted the atomic multi-leg order at a $${position.netDebit.toFixed(2)} debit limit.`,
  });
}
