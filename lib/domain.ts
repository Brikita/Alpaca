export type Strategy =
  | 'iron_condor'
  | 'long_iron_butterfly'
  | 'long_straddle'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'abstain';

export type Direction = 'bullish' | 'bearish' | 'neutral';

export interface MarketSignal {
  symbol: string;
  modelMovePct: number;
  impliedMovePct: number;
  directionalConfidence: number;
  direction: Direction;
  spreadPct: number;
  quoteAgeSeconds: number;
}

export interface AgentVote {
  agent: 'regime' | 'volatility' | 'catalyst' | 'memory' | 'red_team';
  approved: boolean;
  confidence: number;
  rationale: string;
}

export interface TradeProposal {
  id: string;
  symbol: string;
  strategy: Exclude<Strategy, 'abstain'>;
  maxLoss: number;
  maxProfit: number | null;
  definedRisk: boolean;
  nakedShort: boolean;
  expiresToday: boolean;
  paperAccount: boolean;
  spreadPct: number;
  quoteAgeSeconds: number;
  correlationSlotsAfter: number;
  confidence: number;
  votes: AgentVote[];
}

export interface PortfolioSnapshot {
  openRisk: number;
  openPositions: number;
  dailyDrawdown: number;
  competitionDrawdown: number;
}

export interface RiskPolicy {
  maxLossPerTrade: number;
  minRewardRiskRatio: number;
  maxOpenRisk: number;
  maxOpenPositions: number;
  maxDailyDrawdown: number;
  maxCompetitionDrawdown: number;
  maxCorrelatedPositions: number;
  maxSpreadPct: number;
  maxQuoteAgeSeconds: number;
  minConfidence: number;
}

export interface GateResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RiskDecision {
  approved: boolean;
  passed: number;
  total: number;
  gates: GateResult[];
}

export const DEFAULT_RISK_POLICY: RiskPolicy = {
  maxLossPerTrade: 500,
  minRewardRiskRatio: 0.25,
  maxOpenRisk: 1_000,
  maxOpenPositions: 2,
  maxDailyDrawdown: 1_500,
  maxCompetitionDrawdown: 4_000,
  maxCorrelatedPositions: 2,
  maxSpreadPct: 0.12,
  maxQuoteAgeSeconds: 60,
  minConfidence: 0.65,
};
