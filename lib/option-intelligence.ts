import type { Direction, MarketSignal, Strategy } from './domain.ts';
import { selectStrategy } from './strategy.ts';
import type { CatalystSnapshot } from './catalyst.ts';
import type { MarketCalendarSession } from './market-calendar.ts';
import { evidenceAgeSeconds, timestampMs } from './evidence-time.ts';

export interface PriceBar {
  c: number;
  h?: number;
  l?: number;
  o?: number;
  t: string;
  v?: number;
}

export interface MarketQuote {
  ap?: number;
  as?: number;
  bp?: number;
  bs?: number;
  t?: string;
}

export interface StockSnapshot {
  symbol?: string;
  dailyBar?: PriceBar;
  latestQuote?: MarketQuote;
  latestTrade?: { p?: number; t?: string };
}

export interface OptionSnapshot {
  dailyBar?: PriceBar;
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  latestQuote?: MarketQuote;
}

export interface OptionChainResponse {
  next_page_token?: string;
  snapshots?: Record<string, OptionSnapshot>;
}

export interface OptionContractQuote {
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  quoteAgeSeconds: number;
  volume: number;
}

export interface ScanCheck {
  id: 'session' | 'history' | 'pair' | 'liquidity' | 'freshness' | 'edge';
  label: string;
  passed: boolean;
  detail: string;
}

export interface OptionScan {
  symbol: string;
  capturedAt: string;
  expiration: string;
  status: 'candidate' | 'abstain' | 'unavailable';
  strategy: Strategy;
  confidence: number;
  thesis: string;
  underlyingPrice: number | null;
  atmStrike: number | null;
  callSymbol: string | null;
  putSymbol: string | null;
  callMid: number | null;
  putMid: number | null;
  modelMovePct: number | null;
  impliedMovePct: number | null;
  directionalConfidence: number;
  direction: Direction;
  spreadPct: number | null;
  quoteAgeSeconds: number | null;
  combinedVolume: number;
  contracts: OptionContractQuote[];
  checks: ScanCheck[];
}

export interface OptionScanBatch {
  schemaVersion: 1;
  source: 'alpaca-cli';
  mode: 'paper';
  capturedAt: string;
  marketOpen: boolean;
  targetExpiration: string;
  universe: string[];
  scans: OptionScan[];
  leaderSymbol: string | null;
  candidateCount: number;
  catalyst?: CatalystSnapshot;
  calendar?: MarketCalendarSession[];
}

interface ParsedOptionSymbol {
  underlying: string;
  expiration: string;
  type: 'call' | 'put';
  strike: number;
}

export interface ScanInput {
  symbol: string;
  capturedAt: string;
  expiration: string;
  marketOpen: boolean;
  stock: StockSnapshot;
  bars: PriceBar[];
  chain: OptionChainResponse;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseOptionSymbol(symbol: string): ParsedOptionSymbol | null {
  const match = symbol.match(/^(.+?)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const [, underlying, date, side, strikeText] = match;
  const year = Number(date.slice(0, 2)) + 2000;
  return {
    underlying,
    expiration: `${year}-${date.slice(2, 4)}-${date.slice(4, 6)}`,
    type: side === 'C' ? 'call' : 'put',
    strike: Number(strikeText) / 1000,
  };
}

export function stockReferencePrice(snapshot: StockSnapshot): number | null {
  return stockReference(snapshot)?.price ?? null;
}

function stockReference(snapshot: StockSnapshot): { price: number; timestamp: string | undefined } | null {
  const bid = snapshot.latestQuote?.bp;
  const ask = snapshot.latestQuote?.ap;
  if (finite(bid) && finite(ask) && bid > 0 && ask >= bid) return { price: (bid + ask) / 2, timestamp: snapshot.latestQuote?.t };
  if (finite(snapshot.latestTrade?.p) && snapshot.latestTrade.p > 0) return { price: snapshot.latestTrade.p, timestamp: snapshot.latestTrade.t };
  if (finite(snapshot.dailyBar?.c) && snapshot.dailyBar.c > 0) return { price: snapshot.dailyBar.c, timestamp: snapshot.dailyBar.t };
  return null;
}

function quoteMetrics(snapshot: OptionSnapshot | undefined) {
  const bid = snapshot?.latestQuote?.bp;
  const ask = snapshot?.latestQuote?.ap;
  if (!finite(bid) || !finite(ask) || bid <= 0 || ask < bid) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return {
    mid,
    spreadPct: (ask - bid) / mid,
    timestamp: snapshot?.latestQuote?.t ?? null,
    volume: finite(snapshot?.dailyBar?.v) ? snapshot.dailyBar.v : 0,
  };
}

function sampleDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function tradingDaysToExpiry(fromTimestamp: string, expiration: string): number {
  const start = new Date(fromTimestamp);
  const end = new Date(`${expiration}T23:59:59Z`);
  let days = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1));
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.max(1, days);
}

function modelMove(bars: PriceBar[], expiration: string): { movePct: number | null; direction: Direction; confidence: number } {
  const closes = bars
    .filter((bar) => finite(bar.c) && bar.c > 0 && Boolean(bar.t))
    .sort((left, right) => left.t.localeCompare(right.t))
    .slice(-21);
  if (closes.length < 11) return { movePct: null, direction: 'neutral', confidence: 0 };

  const returns = closes.slice(1).map((bar, index) => Math.log(bar.c / closes[index].c));
  const dailyDeviation = sampleDeviation(returns);
  if (!dailyDeviation) return { movePct: null, direction: 'neutral', confidence: 0 };
  const horizon = tradingDaysToExpiry(closes.at(-1)!.t, expiration);
  const movePct = dailyDeviation * Math.sqrt(horizon) * 100;

  const momentumBase = closes[Math.max(0, closes.length - 6)].c;
  const momentumPct = ((closes.at(-1)!.c / momentumBase) - 1) * 100;
  const momentumNoise = dailyDeviation * Math.sqrt(Math.min(5, closes.length - 1)) * 100;
  const score = momentumNoise > 0 ? Math.abs(momentumPct) / momentumNoise : 0;
  if (score < 1) return { movePct, direction: 'neutral', confidence: 0.5 };
  return {
    movePct,
    direction: momentumPct > 0 ? 'bullish' : 'bearish',
    confidence: Math.min(0.85, 0.55 + score * 0.12),
  };
}

export function buildUnavailableScan(
  input: Pick<ScanInput, 'symbol' | 'capturedAt' | 'expiration' | 'marketOpen'>,
  detail: string,
  underlyingPrice: number | null = null,
): OptionScan {
  const checks: ScanCheck[] = [
    { id: 'session', label: 'Market session', passed: input.marketOpen, detail: input.marketOpen ? 'Market open' : 'Market closed' },
    { id: 'history', label: 'Historical model', passed: false, detail },
    { id: 'pair', label: 'ATM option pair', passed: false, detail },
    { id: 'liquidity', label: 'Execution quality', passed: false, detail },
    { id: 'freshness', label: 'Quote freshness', passed: false, detail },
    { id: 'edge', label: 'Strategy edge', passed: false, detail },
  ];
  return {
    symbol: input.symbol, capturedAt: input.capturedAt, expiration: input.expiration,
    status: 'unavailable', strategy: 'abstain', confidence: 0,
    thesis: `${input.symbol} was unavailable: ${detail}.`, underlyingPrice, atmStrike: null,
    callSymbol: null, putSymbol: null, callMid: null, putMid: null,
    modelMovePct: null, impliedMovePct: null, directionalConfidence: 0,
    direction: 'neutral', spreadPct: null, quoteAgeSeconds: null,
    combinedVolume: 0, contracts: [], checks,
  };
}

export function buildOptionScan(input: ScanInput): OptionScan {
  const reference = stockReference(input.stock);
  const underlyingPrice = reference?.price;
  if (!underlyingPrice) return buildUnavailableScan(input, 'Underlying price unavailable');
  if (!Number.isFinite(timestampMs(input.capturedAt))) throw new Error('A valid scan capture timestamp is required.');

  const pairs = new Map<number, { call?: [string, OptionSnapshot]; put?: [string, OptionSnapshot] }>();
  const contracts: OptionContractQuote[] = [];
  for (const [symbol, snapshot] of Object.entries(input.chain.snapshots ?? {})) {
    const contract = parseOptionSymbol(symbol);
    if (!contract || contract.underlying !== input.symbol || contract.expiration !== input.expiration) continue;
    const metrics = quoteMetrics(snapshot);
    const contractAge = evidenceAgeSeconds(metrics?.timestamp, input.capturedAt);
    if (metrics && Number.isFinite(contractAge)) {
      contracts.push({
        symbol,
        type: contract.type,
        strike: contract.strike,
        bid: round(snapshot.latestQuote!.bp!),
        ask: round(snapshot.latestQuote!.ap!),
        mid: round(metrics.mid),
        spreadPct: round(metrics.spreadPct),
        quoteAgeSeconds: Math.ceil(contractAge),
        volume: metrics.volume,
      });
    }
    const pair = pairs.get(contract.strike) ?? {};
    pair[contract.type] = [symbol, snapshot];
    pairs.set(contract.strike, pair);
  }

  const paired = [...pairs.entries()]
    .filter(([, pair]) => pair.call && pair.put && quoteMetrics(pair.call[1]) && quoteMetrics(pair.put[1]))
    .sort((left, right) => Math.abs(left[0] - underlyingPrice) - Math.abs(right[0] - underlyingPrice));
  if (!paired.length) return buildUnavailableScan(input, 'No quoted call/put pair near the money', underlyingPrice);

  const [atmStrike, pair] = paired[0];
  const [callSymbol, callSnapshot] = pair.call!;
  const [putSymbol, putSnapshot] = pair.put!;
  const call = quoteMetrics(callSnapshot)!;
  const put = quoteMetrics(putSnapshot)!;
  const historical = modelMove(input.bars.filter((bar) => Number.isFinite(evidenceAgeSeconds(bar.t, input.capturedAt))), input.expiration);
  const impliedMovePct = ((call.mid + put.mid) / underlyingPrice) * 100;
  const spreadPct = Math.max(call.spreadPct, put.spreadPct);
  const age = Math.max(
    evidenceAgeSeconds(call.timestamp, input.capturedAt),
    evidenceAgeSeconds(put.timestamp, input.capturedAt),
    evidenceAgeSeconds(reference?.timestamp, input.capturedAt),
  );
  const combinedVolume = call.volume + put.volume;

  const signal: MarketSignal | null = historical.movePct === null ? null : {
    symbol: input.symbol,
    modelMovePct: historical.movePct,
    impliedMovePct,
    directionalConfidence: historical.confidence,
    direction: historical.direction,
    spreadPct,
    quoteAgeSeconds: age,
  };
  const selection = signal
    ? selectStrategy({ ...signal, spreadPct: 0, quoteAgeSeconds: 0 })
    : { strategy: 'abstain' as const, reason: 'Historical model unavailable.', edge: 0 };

  const checks: ScanCheck[] = [
    { id: 'session', label: 'Market session', passed: input.marketOpen, detail: input.marketOpen ? 'Market open' : 'Market closed; observation only' },
    { id: 'history', label: 'Historical model', passed: historical.movePct !== null, detail: historical.movePct === null ? 'Fewer than 10 returns' : `${round(historical.movePct, 2)}% modeled move` },
    { id: 'pair', label: 'ATM option pair', passed: true, detail: `${callSymbol} + ${putSymbol}` },
    { id: 'liquidity', label: 'Execution quality', passed: spreadPct <= 0.12 && combinedVolume >= 100, detail: `${round(spreadPct * 100, 2)}% widest spread · ${combinedVolume} volume` },
    { id: 'freshness', label: 'Quote freshness', passed: age <= 60, detail: Number.isFinite(age) ? `${Math.ceil(age)}s oldest underlying / option quote` : 'Underlying or option timestamp is missing, invalid, or future-dated' },
    { id: 'edge', label: 'Strategy edge', passed: selection.strategy !== 'abstain', detail: selection.reason },
  ];
  const candidate = checks.every((check) => check.passed) && selection.strategy !== 'abstain';
  const failed = checks.filter((check) => !check.passed).map((check) => check.label.toLowerCase());
  const ratio = historical.movePct ? impliedMovePct / historical.movePct : null;
  const thesis = candidate
    ? `${input.symbol} options price a ${round(impliedMovePct, 2)}% move versus a ${round(historical.movePct!, 2)}% realized-volatility model; ${selection.reason}`
    : `${input.symbol} abstained because ${failed.join(', ')}${ratio ? `; implied/model ratio ${round(ratio, 2)}×` : ''}.`;

  return {
    symbol: input.symbol,
    capturedAt: input.capturedAt,
    expiration: input.expiration,
    status: candidate ? 'candidate' : 'abstain',
    strategy: candidate ? selection.strategy : 'abstain',
    confidence: candidate ? Math.min(0.95, 0.6 + Math.min(0.3, selection.edge * 0.2)) : 0,
    thesis,
    underlyingPrice: round(underlyingPrice),
    atmStrike,
    callSymbol,
    putSymbol,
    callMid: round(call.mid),
    putMid: round(put.mid),
    modelMovePct: historical.movePct === null ? null : round(historical.movePct),
    impliedMovePct: round(impliedMovePct),
    directionalConfidence: round(historical.confidence),
    direction: historical.direction,
    spreadPct: round(spreadPct),
    quoteAgeSeconds: Number.isFinite(age) ? Math.ceil(age) : null,
    combinedVolume,
    contracts: candidate
      ? contracts.sort((left, right) => left.strike - right.strike || left.type.localeCompare(right.type))
      : [],
    checks,
  };
}

export function chooseScanLeader(scans: OptionScan[]): string | null {
  const rank = (status: OptionScan['status']) => status === 'candidate' ? 2 : status === 'abstain' ? 1 : 0;
  return [...scans].sort((left, right) =>
    rank(right.status) - rank(left.status)
    || right.checks.filter((check) => check.passed).length - left.checks.filter((check) => check.passed).length
    || right.confidence - left.confidence,
  )[0]?.symbol ?? null;
}
