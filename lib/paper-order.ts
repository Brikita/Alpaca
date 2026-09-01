import type { AgentVote, RiskDecision } from './domain.ts';
import { DEFAULT_RISK_POLICY } from './domain.ts';
import { runAlpaca, type AlpacaEnvironment } from './alpaca-cli.ts';
import type { ConstructedPosition } from './position-constructor.ts';

export type PaperOrderEventType = 'previewed' | 'submitted' | 'rejected' | 'reconciled';

export interface PaperOrderEvent {
  schemaVersion: 1;
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
    positionIntent: 'buy_to_open' | 'sell_to_open';
    ratioQuantity: number;
  }>;
  councilVotes: AgentVote[];
  riskDecision: RiskDecision;
  brokerStatus: string;
  filledQuantity: number;
  filledAveragePrice: number | null;
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
    schemaVersion: 1,
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
