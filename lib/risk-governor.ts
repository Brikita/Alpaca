import {
  DEFAULT_RISK_POLICY,
  type GateResult,
  type PortfolioSnapshot,
  type RiskDecision,
  type RiskPolicy,
  type TradeProposal,
} from './domain.ts';
import { isCompleteAgentVoteSet, REQUIRED_AGENT_NAMES } from './agent-votes.ts';

function gate(id: string, label: string, passed: boolean, detail: string): GateResult {
  return { id, label, passed, detail };
}

function nonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function evaluateProposal(
  proposal: TradeProposal,
  portfolio: PortfolioSnapshot,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
): RiskDecision {
  const completeCouncil = isCompleteAgentVoteSet(proposal.votes);
  const voteByAgent = new Map(completeCouncil ? proposal.votes.map((vote) => [vote.agent, vote]) : []);
  const approvedAgents = completeCouncil
    ? REQUIRED_AGENT_NAMES.filter((agent) => voteByAgent.get(agent)?.approved === true)
    : [];
  const councilApproved = completeCouncil
    && approvedAgents.length === REQUIRED_AGENT_NAMES.length
    && Number.isFinite(proposal.confidence) && proposal.confidence <= 1
    && proposal.confidence >= policy.minConfidence;
  const blockedAgents = completeCouncil
    ? REQUIRED_AGENT_NAMES.filter((agent) => voteByAgent.get(agent)?.approved !== true)
    : REQUIRED_AGENT_NAMES;
  const rewardRiskRatio = nonnegative(proposal.maxLoss) && proposal.maxLoss > 0
    && typeof proposal.maxProfit === 'number' && Number.isFinite(proposal.maxProfit)
    ? proposal.maxProfit / proposal.maxLoss
    : null;

  const gates: GateResult[] = [
    gate('paper', 'Paper account only', proposal.paperAccount, proposal.paperAccount ? 'Paper mode verified' : 'Live account blocked'),
    gate('defined-risk', 'Loss is defined', proposal.definedRisk, proposal.definedRisk ? `$${proposal.maxLoss} maximum` : 'Unbounded loss'),
    gate('naked-short', 'No naked short legs', !proposal.nakedShort, proposal.nakedShort ? 'Naked short detected' : 'Every short leg is covered'),
    gate('expiry', 'Not expiring today', !proposal.expiresToday, proposal.expiresToday ? 'Same-day expiry blocked' : 'Expiry window accepted'),
    gate('trade-risk', 'Per-trade risk', nonnegative(proposal.maxLoss) && proposal.maxLoss > 0 && proposal.maxLoss <= policy.maxLossPerTrade, `$${proposal.maxLoss} / $${policy.maxLossPerTrade}`),
    gate(
      'payoff-quality',
      'Minimum reward / risk',
      rewardRiskRatio !== null && rewardRiskRatio >= policy.minRewardRiskRatio,
      rewardRiskRatio === null
        ? `Finite maximum profit required · ${policy.minRewardRiskRatio.toFixed(2)}x minimum`
        : `${rewardRiskRatio.toFixed(2)}x / ${policy.minRewardRiskRatio.toFixed(2)}x minimum`,
    ),
    gate('portfolio-risk', 'Portfolio risk', nonnegative(portfolio.openRisk) && portfolio.openRisk + proposal.maxLoss <= policy.maxOpenRisk, `$${portfolio.openRisk + proposal.maxLoss} / $${policy.maxOpenRisk}`),
    gate('position-capacity', 'Strategy capacity', Number.isInteger(portfolio.openPositions) && portfolio.openPositions >= 0 && portfolio.openPositions + 1 <= policy.maxOpenPositions, `${portfolio.openPositions + 1} / ${policy.maxOpenPositions} positions`),
    gate('daily-drawdown', 'Daily drawdown', nonnegative(portfolio.dailyDrawdown) && portfolio.dailyDrawdown <= policy.maxDailyDrawdown, `$${portfolio.dailyDrawdown} / $${policy.maxDailyDrawdown}`),
    gate('competition-drawdown', 'Competition drawdown', nonnegative(portfolio.competitionDrawdown) && portfolio.competitionDrawdown <= policy.maxCompetitionDrawdown, `$${portfolio.competitionDrawdown} / $${policy.maxCompetitionDrawdown}`),
    gate('correlation', 'Correlation capacity', Number.isInteger(proposal.correlationSlotsAfter) && proposal.correlationSlotsAfter >= 1 && proposal.correlationSlotsAfter <= policy.maxCorrelatedPositions, `${proposal.correlationSlotsAfter} / ${policy.maxCorrelatedPositions} slots`),
    gate('spread', 'Bid-ask spread', nonnegative(proposal.spreadPct) && proposal.spreadPct <= policy.maxSpreadPct, `${Math.round(proposal.spreadPct * 100)}% / ${Math.round(policy.maxSpreadPct * 100)}%`),
    gate('quote-age', 'Quote freshness', nonnegative(proposal.quoteAgeSeconds) && proposal.quoteAgeSeconds <= policy.maxQuoteAgeSeconds, `${proposal.quoteAgeSeconds}s / ${policy.maxQuoteAgeSeconds}s`),
    gate(
      'council',
      'Agent council',
      councilApproved,
      completeCouncil
        ? `${approvedAgents.length}/${REQUIRED_AGENT_NAMES.length} required specialists approved${blockedAgents.length ? ` · blocked: ${blockedAgents.join(', ')}` : ''} · ${Math.round(proposal.confidence * 100)}% signal score`
        : `Invalid specialist set · required: ${REQUIRED_AGENT_NAMES.join(', ')}`,
    ),
  ];

  const passed = gates.filter((item) => item.passed).length;
  return { approved: passed === gates.length, passed, total: gates.length, gates };
}
