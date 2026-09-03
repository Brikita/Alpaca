import {
  DEFAULT_RISK_POLICY,
  type AgentVote,
  type Strategy,
  type TradeProposal,
} from './domain.ts';
import type { OptionContractQuote, OptionScan } from './option-intelligence.ts';

export interface PositionLeg {
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  side: 'buy' | 'sell';
  quantity: number;
  midpoint: number;
  limitPrice: number;
}

export interface ConstructedPosition {
  id: string;
  symbol: string;
  strategy: Exclude<Strategy, 'abstain'>;
  sourceStrategy: Exclude<OptionScan['strategy'], 'abstain'>;
  expiration: string;
  quantity: number;
  legs: PositionLeg[];
  netDebit: number;
  maxLoss: number;
  maxProfit: number | null;
  riskBudget: number;
  optimized: boolean;
  pricingBasis: 'midpoint' | 'buy-ask-sell-bid';
  rationale: string;
  definedRisk: true;
  nakedShort: false;
  expiresToday: boolean;
  spreadPct: number;
  quoteAgeSeconds: number;
  confidence: number;
}

export type PositionConstructionResult =
  | { status: 'constructed'; position: ConstructedPosition }
  | { status: 'blocked'; reason: string };

interface WingCombination {
  callWing: OptionContractQuote;
  putWing: OptionContractQuote;
  netDebit: number;
  maxLoss: number;
  maxProfit: number;
  spreadPct: number;
  quoteAgeSeconds: number;
  targetDeviation: number;
}

interface VerticalCombination {
  wing: OptionContractQuote;
  netDebit: number;
  maxLoss: number;
  maxProfit: number;
  spreadPct: number;
  quoteAgeSeconds: number;
  targetDeviation: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function payoffQualityPasses(maxProfit: number, maxLoss: number): boolean {
  return maxLoss > 0
    && maxProfit > 0
    && maxProfit / maxLoss >= DEFAULT_RISK_POLICY.minRewardRiskRatio;
}

function validWing(contract: OptionContractQuote): boolean {
  return contract.bid > 0
    && contract.ask >= contract.bid
    && contract.spreadPct <= DEFAULT_RISK_POLICY.maxSpreadPct
    && contract.quoteAgeSeconds <= DEFAULT_RISK_POLICY.maxQuoteAgeSeconds
    && contract.volume >= 10;
}

function contractFor(scan: OptionScan, symbol: string | null): OptionContractQuote | null {
  return scan.contracts?.find((contract) => contract.symbol === symbol) ?? null;
}

function optimizeLongStraddle(
  scan: OptionScan,
  quantity: number,
  riskBudget: number,
): ConstructedPosition | null {
  if (scan.atmStrike === null || scan.underlyingPrice === null || scan.modelMovePct === null) return null;
  const call = contractFor(scan, scan.callSymbol);
  const put = contractFor(scan, scan.putSymbol);
  if (!call || !put || !validWing(call) || !validWing(put)) return null;

  const callWings = scan.contracts.filter(
    (contract) => contract.type === 'call' && contract.strike > scan.atmStrike! && validWing(contract),
  );
  const putWings = scan.contracts.filter(
    (contract) => contract.type === 'put' && contract.strike < scan.atmStrike! && validWing(contract),
  );
  const targetWidth = scan.underlyingPrice * (scan.modelMovePct / 100);
  const combinations: WingCombination[] = [];

  for (const callWing of callWings) {
    for (const putWing of putWings) {
      const callWidth = callWing.strike - scan.atmStrike;
      const putWidth = scan.atmStrike - putWing.strike;
      const netDebit = roundCurrency(
        (call.ask + put.ask - callWing.bid - putWing.bid) * quantity,
      );
      if (netDebit <= 0) continue;
      const maxLoss = roundCurrency(netDebit * 100);
      const narrowWidth = Math.min(callWidth, putWidth) * quantity;
      const maxProfit = roundCurrency((narrowWidth - netDebit) * 100);
      if (maxLoss > riskBudget || !payoffQualityPasses(maxProfit, maxLoss)) continue;
      combinations.push({
        callWing,
        putWing,
        netDebit,
        maxLoss,
        maxProfit,
        spreadPct: Math.max(call.spreadPct, put.spreadPct, callWing.spreadPct, putWing.spreadPct),
        quoteAgeSeconds: Math.max(
          call.quoteAgeSeconds,
          put.quoteAgeSeconds,
          callWing.quoteAgeSeconds,
          putWing.quoteAgeSeconds,
        ),
        targetDeviation: Math.abs(callWidth - targetWidth)
          + Math.abs(putWidth - targetWidth)
          + Math.abs(callWidth - putWidth) * 0.5,
      });
    }
  }

  const best = combinations.sort((left, right) =>
    left.targetDeviation - right.targetDeviation
    || right.maxProfit - left.maxProfit
    || left.spreadPct - right.spreadPct,
  )[0];
  if (!best) return null;

  return {
    id: `${scan.symbol}-${scan.expiration}-${scan.atmStrike}-long_iron_butterfly`,
    symbol: scan.symbol,
    strategy: 'long_iron_butterfly',
    sourceStrategy: 'long_straddle',
    expiration: scan.expiration,
    quantity,
    legs: [
      { symbol: call.symbol, type: 'call', strike: call.strike, side: 'buy', quantity, midpoint: call.mid, limitPrice: call.ask },
      { symbol: put.symbol, type: 'put', strike: put.strike, side: 'buy', quantity, midpoint: put.mid, limitPrice: put.ask },
      { symbol: best.callWing.symbol, type: 'call', strike: best.callWing.strike, side: 'sell', quantity, midpoint: best.callWing.mid, limitPrice: best.callWing.bid },
      { symbol: best.putWing.symbol, type: 'put', strike: best.putWing.strike, side: 'sell', quantity, midpoint: best.putWing.mid, limitPrice: best.putWing.bid },
    ],
    netDebit: best.netDebit,
    maxLoss: best.maxLoss,
    maxProfit: best.maxProfit,
    riskBudget,
    optimized: true,
    pricingBasis: 'buy-ask-sell-bid',
    rationale: `ATM volatility exposure preserved with wings near the modeled ±${roundCurrency(targetWidth)} move; worst-case debit stays within the $${riskBudget} budget.`,
    definedRisk: true,
    nakedShort: false,
    expiresToday: scan.expiration === scan.capturedAt.slice(0, 10),
    spreadPct: best.spreadPct,
    quoteAgeSeconds: best.quoteAgeSeconds,
    confidence: scan.confidence,
  };
}

function constructLongStraddle(
  scan: OptionScan,
  quantity: number,
  riskBudget: number,
): ConstructedPosition | null {
  if (!scan.callSymbol || !scan.putSymbol || scan.callMid === null || scan.putMid === null) return null;
  if (scan.callMid <= 0 || scan.putMid <= 0 || scan.spreadPct === null || scan.quoteAgeSeconds === null) return null;
  const call = contractFor(scan, scan.callSymbol);
  const put = contractFor(scan, scan.putSymbol);
  const netDebit = roundCurrency((scan.callMid + scan.putMid) * quantity);
  return {
    id: `${scan.symbol}-${scan.expiration}-${scan.atmStrike ?? 'atm'}-long_straddle`,
    symbol: scan.symbol,
    strategy: 'long_straddle',
    sourceStrategy: 'long_straddle',
    expiration: scan.expiration,
    quantity,
    legs: [
      { symbol: scan.callSymbol, type: 'call', strike: call?.strike ?? scan.atmStrike ?? 0, side: 'buy', quantity, midpoint: scan.callMid, limitPrice: scan.callMid },
      { symbol: scan.putSymbol, type: 'put', strike: put?.strike ?? scan.atmStrike ?? 0, side: 'buy', quantity, midpoint: scan.putMid, limitPrice: scan.putMid },
    ],
    netDebit,
    maxLoss: roundCurrency(netDebit * 100),
    maxProfit: null,
    riskBudget,
    optimized: false,
    pricingBasis: 'midpoint',
    rationale: 'No eligible wing combination fit the risk budget, so the original signal is retained for an explicit risk-policy block.',
    definedRisk: true,
    nakedShort: false,
    expiresToday: scan.expiration === scan.capturedAt.slice(0, 10),
    spreadPct: scan.spreadPct,
    quoteAgeSeconds: scan.quoteAgeSeconds,
    confidence: scan.confidence,
  };
}

function optimizeDirectionalSpread(
  scan: OptionScan,
  quantity: number,
  riskBudget: number,
): ConstructedPosition | null {
  if (scan.atmStrike === null || scan.underlyingPrice === null || scan.modelMovePct === null) return null;
  const bearish = scan.strategy === 'bear_put_spread';
  const bullish = scan.strategy === 'bull_call_spread';
  if (!bearish && !bullish) return null;

  const strategy: 'bear_put_spread' | 'bull_call_spread' = bearish
    ? 'bear_put_spread'
    : 'bull_call_spread';
  const optionType = bearish ? 'put' : 'call';
  const long = contractFor(scan, bearish ? scan.putSymbol : scan.callSymbol);
  if (!long || long.type !== optionType || !validWing(long)) return null;

  const targetWidth = scan.underlyingPrice * (scan.modelMovePct / 100);
  const wings = scan.contracts.filter((contract) =>
    contract.type === optionType
    && (bearish ? contract.strike < scan.atmStrike! : contract.strike > scan.atmStrike!)
    && validWing(contract),
  );
  const combinations: VerticalCombination[] = [];

  for (const wing of wings) {
    const width = Math.abs(wing.strike - scan.atmStrike);
    const netDebit = roundCurrency((long.ask - wing.bid) * quantity);
    if (netDebit <= 0) continue;
    const maxLoss = roundCurrency(netDebit * 100);
    const maxProfit = roundCurrency((width * quantity - netDebit) * 100);
    if (maxLoss > riskBudget || !payoffQualityPasses(maxProfit, maxLoss)) continue;
    combinations.push({
      wing,
      netDebit,
      maxLoss,
      maxProfit,
      spreadPct: Math.max(long.spreadPct, wing.spreadPct),
      quoteAgeSeconds: Math.max(long.quoteAgeSeconds, wing.quoteAgeSeconds),
      targetDeviation: Math.abs(width - targetWidth),
    });
  }

  const best = combinations.sort((left, right) =>
    left.targetDeviation - right.targetDeviation
    || right.maxProfit - left.maxProfit
    || left.spreadPct - right.spreadPct,
  )[0];
  if (!best) return null;

  const directionLabel = bearish ? 'bearish put' : 'bullish call';
  return {
    id: `${scan.symbol}-${scan.expiration}-${scan.atmStrike}-${strategy}`,
    symbol: scan.symbol,
    strategy,
    sourceStrategy: strategy,
    expiration: scan.expiration,
    quantity,
    legs: [
      { symbol: long.symbol, type: long.type, strike: long.strike, side: 'buy', quantity, midpoint: long.mid, limitPrice: long.ask },
      { symbol: best.wing.symbol, type: best.wing.type, strike: best.wing.strike, side: 'sell', quantity, midpoint: best.wing.mid, limitPrice: best.wing.bid },
    ],
    netDebit: best.netDebit,
    maxLoss: best.maxLoss,
    maxProfit: best.maxProfit,
    riskBudget,
    optimized: true,
    pricingBasis: 'buy-ask-sell-bid',
    rationale: `The ${directionLabel} vertical uses a covered wing near the modeled ${roundCurrency(targetWidth)} move; conservative net debit stays within the $${riskBudget} budget.`,
    definedRisk: true,
    nakedShort: false,
    expiresToday: scan.expiration === scan.capturedAt.slice(0, 10),
    spreadPct: best.spreadPct,
    quoteAgeSeconds: best.quoteAgeSeconds,
    confidence: scan.confidence,
  };
}

export function constructPosition(
  scan: OptionScan,
  quantity = 1,
  riskBudget = DEFAULT_RISK_POLICY.maxLossPerTrade,
): PositionConstructionResult {
  if (scan.status !== 'candidate' || scan.strategy === 'abstain') {
    return { status: 'blocked', reason: 'Only a fully eligible signal candidate can become a position.' };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { status: 'blocked', reason: 'Option quantity must be a positive whole number.' };
  }
  if (!Number.isFinite(riskBudget) || riskBudget <= 0) {
    return { status: 'blocked', reason: 'The position requires a positive maximum-loss budget.' };
  }
  if (scan.strategy === 'bear_put_spread' || scan.strategy === 'bull_call_spread') {
    const vertical = optimizeDirectionalSpread(scan, quantity, riskBudget);
    return vertical
      ? { status: 'constructed', position: vertical }
      : { status: 'blocked', reason: 'No liquid covered wing produced a positive-payoff vertical within the risk budget.' };
  }
  if (scan.strategy !== 'long_straddle') {
    return {
      status: 'blocked',
      reason: `${scan.strategy} construction is not implemented.`,
    };
  }

  const optimized = optimizeLongStraddle(scan, quantity, riskBudget);
  const position = optimized ?? constructLongStraddle(scan, quantity, riskBudget);
  return position
    ? { status: 'constructed', position }
    : { status: 'blocked', reason: 'The ATM call and put must both have valid execution evidence.' };
}

export function toTradeProposal(
  position: ConstructedPosition,
  votes: AgentVote[] = [],
): TradeProposal {
  return {
    id: position.id,
    symbol: position.symbol,
    strategy: position.strategy,
    maxLoss: position.maxLoss,
    maxProfit: position.maxProfit,
    definedRisk: position.definedRisk,
    nakedShort: position.nakedShort,
    expiresToday: position.expiresToday,
    paperAccount: true,
    spreadPct: position.spreadPct,
    quoteAgeSeconds: position.quoteAgeSeconds,
    correlationSlotsAfter: 1,
    confidence: position.confidence,
    votes,
  };
}
