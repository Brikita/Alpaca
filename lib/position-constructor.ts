import type { AgentVote, TradeProposal } from './domain.ts';
import type { OptionScan } from './option-intelligence.ts';

export interface PositionLeg {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  midpoint: number;
}

export interface ConstructedPosition {
  id: string;
  symbol: string;
  strategy: Exclude<OptionScan['strategy'], 'abstain'>;
  expiration: string;
  quantity: number;
  legs: PositionLeg[];
  netDebit: number;
  maxLoss: number;
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

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function constructPosition(scan: OptionScan, quantity = 1): PositionConstructionResult {
  if (scan.status !== 'candidate' || scan.strategy === 'abstain') {
    return { status: 'blocked', reason: 'Only a fully eligible signal candidate can become a position.' };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { status: 'blocked', reason: 'Option quantity must be a positive whole number.' };
  }
  if (scan.strategy !== 'long_straddle') {
    return {
      status: 'blocked',
      reason: `${scan.strategy} requires additional wing contracts before maximum loss can be calculated.`,
    };
  }
  if (!scan.callSymbol || !scan.putSymbol || scan.callMid === null || scan.putMid === null) {
    return { status: 'blocked', reason: 'The ATM call and put must both have valid midpoint prices.' };
  }
  if (scan.callMid <= 0 || scan.putMid <= 0 || scan.spreadPct === null || scan.quoteAgeSeconds === null) {
    return { status: 'blocked', reason: 'The candidate does not contain valid execution evidence.' };
  }

  const netDebit = roundCurrency((scan.callMid + scan.putMid) * quantity);
  const maxLoss = roundCurrency(netDebit * 100);
  return {
    status: 'constructed',
    position: {
      id: `${scan.symbol}-${scan.expiration}-${scan.atmStrike ?? 'atm'}-${scan.strategy}`,
      symbol: scan.symbol,
      strategy: scan.strategy,
      expiration: scan.expiration,
      quantity,
      legs: [
        { symbol: scan.callSymbol, side: 'buy', quantity, midpoint: scan.callMid },
        { symbol: scan.putSymbol, side: 'buy', quantity, midpoint: scan.putMid },
      ],
      netDebit,
      maxLoss,
      definedRisk: true,
      nakedShort: false,
      expiresToday: scan.expiration === scan.capturedAt.slice(0, 10),
      spreadPct: scan.spreadPct,
      quoteAgeSeconds: scan.quoteAgeSeconds,
      confidence: scan.confidence,
    },
  };
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
