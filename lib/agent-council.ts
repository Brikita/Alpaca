import { DEFAULT_RISK_POLICY, type AgentVote } from './domain.ts';
import type { OptionScan } from './option-intelligence.ts';
import type { ConstructedPosition } from './position-constructor.ts';

function checkPassed(scan: OptionScan, id: OptionScan['checks'][number]['id']): boolean {
  return scan.checks.find((check) => check.id === id)?.passed === true;
}

function directionMatches(scan: OptionScan, position: ConstructedPosition): boolean {
  if (position.strategy === 'bear_put_spread') return scan.direction === 'bearish';
  if (position.strategy === 'bull_call_spread') return scan.direction === 'bullish';
  return scan.direction === 'neutral';
}

export function runAgentCouncil(
  scan: OptionScan,
  position: ConstructedPosition,
): AgentVote[] {
  const regimeApproved = scan.status === 'candidate'
    && checkPassed(scan, 'session')
    && checkPassed(scan, 'history')
    && checkPassed(scan, 'pair')
    && directionMatches(scan, position);
  const volatilityApproved = checkPassed(scan, 'edge')
    && checkPassed(scan, 'liquidity')
    && checkPassed(scan, 'freshness')
    && position.spreadPct <= DEFAULT_RISK_POLICY.maxSpreadPct
    && position.quoteAgeSeconds <= DEFAULT_RISK_POLICY.maxQuoteAgeSeconds;
  const redTeamApproved = position.definedRisk
    && !position.nakedShort
    && !position.expiresToday
    && position.maxLoss <= DEFAULT_RISK_POLICY.maxLossPerTrade
    && position.maxProfit !== null
    && position.maxProfit > 0
    && position.legs.length >= 2
    && position.legs.some((leg) => leg.side === 'buy')
    && position.legs.every((leg) => leg.quantity === position.quantity);

  return [
    {
      agent: 'regime',
      approved: regimeApproved,
      confidence: scan.directionalConfidence,
      rationale: regimeApproved
        ? `${scan.direction} regime agrees with the ${position.strategy} structure.`
        : 'Session, model history, option pairing, or directional alignment is incomplete.',
    },
    {
      agent: 'volatility',
      approved: volatilityApproved,
      confidence: scan.confidence,
      rationale: volatilityApproved
        ? `Signal edge passed with ${Math.round(position.spreadPct * 10_000) / 100}% widest spread and ${position.quoteAgeSeconds}s quote age.`
        : 'Edge, liquidity, or quote freshness is outside execution policy.',
    },
    {
      agent: 'catalyst',
      approved: false,
      confidence: 0,
      rationale: 'No verified economic-event feed is connected; this specialist abstains rather than inventing event clearance.',
    },
    {
      agent: 'red_team',
      approved: redTeamApproved,
      confidence: redTeamApproved ? Math.min(scan.confidence, 0.85) : 1,
      rationale: redTeamApproved
        ? `No veto: every short leg is covered and maximum loss is $${position.maxLoss}.`
        : 'Veto: structure, expiry, payoff, quantity, or maximum-loss evidence failed.',
    },
  ];
}
