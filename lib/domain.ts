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
  agent: 'regime' | 'volatility' | 'catalyst' | 'red_team';
  approved: boolean;
  confidence: number;
  rationale: string;
}

export interface TradeProposal {
  id: string;
  symbol: string;
  strategy: Exclude<Strategy, 'abstain'>;
  maxLoss: number;
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
  dailyDrawdown: number;
  competitionDrawdown: number;
}

export interface RiskPolicy {
  maxLossPerTrade: number;
  maxOpenRisk: number;
  maxDailyDrawdown: number;
  maxCompetitionDrawdown: number;
  maxCorrelatedPositions: number;
  maxSpreadPct: number;
  maxQuoteAgeSeconds: number;
  minConfidence: number;
  minAgentApprovals: number;
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
  maxOpenRisk: 3_000,
  maxDailyDrawdown: 1_500,
  maxCompetitionDrawdown: 4_000,
  maxCorrelatedPositions: 2,
  maxSpreadPct: 0.12,
  maxQuoteAgeSeconds: 60,
  minConfidence: 0.65,
  minAgentApprovals: 2,
};
