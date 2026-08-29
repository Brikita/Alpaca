import { runAlpaca } from './alpaca-cli.ts';

interface AlpacaAccountResponse {
  status?: string;
  currency?: string;
  cash?: string;
  equity?: string;
  last_equity?: string;
  buying_power?: string;
  options_buying_power?: string;
  options_trading_level?: number;
  account_blocked?: boolean;
  trading_blocked?: boolean;
  trade_suspended_by_user?: boolean;
}

interface AlpacaClockResponse {
  timestamp?: string;
  is_open?: boolean;
  next_open?: string;
  next_close?: string;
}

interface AlpacaPositionResponse {
  symbol?: string;
  asset_class?: string;
  qty?: string;
  side?: string;
  market_value?: string;
  cost_basis?: string;
  unrealized_pl?: string;
  unrealized_plpc?: string;
}

interface AlpacaOrderResponse {
  id?: string;
  client_order_id?: string;
  symbol?: string;
  asset_class?: string;
  side?: string;
  qty?: string;
  type?: string;
  status?: string;
  submitted_at?: string;
  order_class?: string;
}

export interface SafePosition {
  symbol: string;
  assetClass: string;
  quantity: number;
  side: string;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface SafeOrder {
  clientOrderId: string;
  symbol: string;
  assetClass: string;
  side: string;
  quantity: number;
  type: string;
  status: string;
  submittedAt: string | null;
  orderClass: string;
}

export interface AlpacaSnapshot {
  schemaVersion: 1;
  source: 'alpaca-cli';
  mode: 'paper';
  capturedAt: string;
  account: {
    status: string;
    currency: string;
    cash: number;
    equity: number;
    previousEquity: number;
    buyingPower: number;
    optionsBuyingPower: number;
    optionsTradingLevel: number;
    accountBlocked: boolean;
    tradingBlocked: boolean;
    suspendedByUser: boolean;
  };
  market: {
    timestamp: string | null;
    isOpen: boolean;
    nextOpen: string | null;
    nextClose: string | null;
  };
  positions: SafePosition[];
  openOrders: SafeOrder[];
}

function number(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sanitizeSnapshot(
  account: AlpacaAccountResponse,
  clock: AlpacaClockResponse,
  positions: AlpacaPositionResponse[],
  orders: AlpacaOrderResponse[],
  capturedAt = new Date().toISOString(),
): AlpacaSnapshot {
  return {
    schemaVersion: 1,
    source: 'alpaca-cli',
    mode: 'paper',
    capturedAt,
    account: {
      status: account.status ?? 'UNKNOWN',
      currency: account.currency ?? 'USD',
      cash: number(account.cash),
      equity: number(account.equity),
      previousEquity: number(account.last_equity),
      buyingPower: number(account.buying_power),
      optionsBuyingPower: number(account.options_buying_power),
      optionsTradingLevel: account.options_trading_level ?? 0,
      accountBlocked: Boolean(account.account_blocked),
      tradingBlocked: Boolean(account.trading_blocked),
      suspendedByUser: Boolean(account.trade_suspended_by_user),
    },
    market: {
      timestamp: clock.timestamp ?? null,
      isOpen: Boolean(clock.is_open),
      nextOpen: clock.next_open ?? null,
      nextClose: clock.next_close ?? null,
    },
    positions: positions.map((position) => ({
      symbol: position.symbol ?? 'UNKNOWN',
      assetClass: position.asset_class ?? 'unknown',
      quantity: number(position.qty),
      side: position.side ?? 'unknown',
      marketValue: number(position.market_value),
      costBasis: number(position.cost_basis),
      unrealizedPnl: number(position.unrealized_pl),
      unrealizedPnlPct: number(position.unrealized_plpc),
    })),
    openOrders: orders.map((order) => ({
      clientOrderId: order.client_order_id ?? 'unknown',
      symbol: order.symbol ?? 'UNKNOWN',
      assetClass: order.asset_class ?? 'unknown',
      side: order.side ?? 'unknown',
      quantity: number(order.qty),
      type: order.type ?? 'unknown',
      status: order.status ?? 'unknown',
      submittedAt: order.submitted_at ?? null,
      orderClass: order.order_class ?? 'simple',
    })),
  };
}

export async function collectAlpacaSnapshot(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AlpacaSnapshot> {
  const safeEnvironment = { ...environment, ALPACA_LIVE_TRADE: 'false' };
  const [account, clock, positions, orders] = await Promise.all([
    runAlpaca<AlpacaAccountResponse>(['account', 'get'], safeEnvironment),
    runAlpaca<AlpacaClockResponse>(['clock'], safeEnvironment),
    runAlpaca<AlpacaPositionResponse[]>(['position', 'list'], safeEnvironment),
    runAlpaca<AlpacaOrderResponse[]>(['order', 'list', '--status', 'open', '--limit', '100'], safeEnvironment),
  ]);

  return sanitizeSnapshot(account.data, clock.data, positions.data, orders.data);
}
