import type { MarketSignal, Strategy } from './domain.ts';

export interface StrategySelection {
  strategy: Strategy;
  reason: string;
  edge: number;
}

export function selectStrategy(signal: MarketSignal): StrategySelection {
  if (signal.spreadPct > 0.12 || signal.quoteAgeSeconds > 60) {
    return {
      strategy: 'abstain',
      reason: 'Execution quality is outside policy.',
      edge: 0,
    };
  }

  const ratio = signal.impliedMovePct / signal.modelMovePct;

  if (signal.directionalConfidence >= 0.7 && signal.direction !== 'neutral') {
    return {
      strategy: signal.direction === 'bullish' ? 'bull_call_spread' : 'bear_put_spread',
      reason: 'Directional conviction is high enough for a defined-risk debit spread.',
      edge: signal.directionalConfidence,
    };
  }

  if (ratio >= 1.35 && signal.directionalConfidence < 0.6) {
    return {
      strategy: 'iron_condor',
      reason: 'The option-implied move materially exceeds the model range.',
      edge: ratio - 1,
    };
  }

  if (ratio <= 0.75) {
    return {
      strategy: 'long_straddle',
      reason: 'The option-implied move is materially below the model range.',
      edge: 1 - ratio,
    };
  }

  return {
    strategy: 'abstain',
    reason: 'No volatility or directional edge clears the entry threshold.',
    edge: Math.abs(1 - ratio),
  };
}
