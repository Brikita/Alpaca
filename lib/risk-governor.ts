import {
  DEFAULT_RISK_POLICY,
  type GateResult,
  type PortfolioSnapshot,
  type RiskDecision,
  type RiskPolicy,
  type TradeProposal,
} from './domain.ts';

function gate(id: string, label: string, passed: boolean, detail: string): GateResult {
  return { id, label, passed, detail };
}

export function evaluateProposal(
  proposal: TradeProposal,
  portfolio: PortfolioSnapshot,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
): RiskDecision {
  const approvals = proposal.votes.filter(
    (vote) => vote.agent !== 'red_team' && vote.approved,
  ).length;
  const redTeam = proposal.votes.find((vote) => vote.agent === 'red_team');

  const gates: GateResult[] = [
    gate('paper', 'Paper account only', proposal.paperAccount, proposal.paperAccount ? 'Paper mode verified' : 'Live account blocked'),
    gate('defined-risk', 'Loss is defined', proposal.definedRisk, proposal.definedRisk ? `$${proposal.maxLoss} maximum` : 'Unbounded loss'),
    gate('naked-short', 'No naked short legs', !proposal.nakedShort, proposal.nakedShort ? 'Naked short detected' : 'Every short leg is covered'),
    gate('expiry', 'Not expiring today', !proposal.expiresToday, proposal.expiresToday ? 'Same-day expiry blocked' : 'Expiry window accepted'),
    gate('trade-risk', 'Per-trade risk', proposal.maxLoss <= policy.maxLossPerTrade, `$${proposal.maxLoss} / $${policy.maxLossPerTrade}`),
    gate('portfolio-risk', 'Portfolio risk', portfolio.openRisk + proposal.maxLoss <= policy.maxOpenRisk, `$${portfolio.openRisk + proposal.maxLoss} / $${policy.maxOpenRisk}`),
    gate('position-capacity', 'Strategy capacity', portfolio.openPositions + 1 <= policy.maxOpenPositions, `${portfolio.openPositions + 1} / ${policy.maxOpenPositions} positions`),
    gate('daily-drawdown', 'Daily drawdown', portfolio.dailyDrawdown <= policy.maxDailyDrawdown, `$${portfolio.dailyDrawdown} / $${policy.maxDailyDrawdown}`),
    gate('competition-drawdown', 'Competition drawdown', portfolio.competitionDrawdown <= policy.maxCompetitionDrawdown, `$${portfolio.competitionDrawdown} / $${policy.maxCompetitionDrawdown}`),
    gate('correlation', 'Correlation capacity', proposal.correlationSlotsAfter <= policy.maxCorrelatedPositions, `${proposal.correlationSlotsAfter} / ${policy.maxCorrelatedPositions} slots`),
    gate('spread', 'Bid-ask spread', proposal.spreadPct <= policy.maxSpreadPct, `${Math.round(proposal.spreadPct * 100)}% / ${Math.round(policy.maxSpreadPct * 100)}%`),
    gate('quote-age', 'Quote freshness', proposal.quoteAgeSeconds <= policy.maxQuoteAgeSeconds, `${proposal.quoteAgeSeconds}s / ${policy.maxQuoteAgeSeconds}s`),
    gate('council', 'Agent council', approvals >= policy.minAgentApprovals && Boolean(redTeam?.approved) && proposal.confidence >= policy.minConfidence, `${approvals} approvals · ${Math.round(proposal.confidence * 100)}% confidence`),
  ];

  const passed = gates.filter((item) => item.passed).length;
  return { approved: passed === gates.length, passed, total: gates.length, gates };
}
