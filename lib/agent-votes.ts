import type { AgentVote } from './domain.ts';

export const REQUIRED_AGENT_NAMES = [
  'regime',
  'volatility',
  'catalyst',
  'memory',
  'red_team',
] as const satisfies readonly AgentVote['agent'][];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCompleteAgentVoteSet(value: unknown): value is AgentVote[] {
  return isAgentVoteSet(value, REQUIRED_AGENT_NAMES);
}

// Historical evidence stays historical: never fabricate a Memory vote for an old trade.
export function isLegacyAgentVoteSet(value: unknown): value is AgentVote[] {
  return isAgentVoteSet(value, ['regime', 'volatility', 'catalyst', 'red_team']);
}

function isAgentVoteSet(value: unknown, names: readonly string[]): value is AgentVote[] {
  if (!Array.isArray(value) || value.length !== names.length) return false;

  const required = new Set<string>(names);
  const agents = new Set<string>();
  for (const vote of value) {
    if (!isRecord(vote)
      || typeof vote.agent !== 'string'
      || !required.has(vote.agent)
      || agents.has(vote.agent)
      || typeof vote.approved !== 'boolean'
      || typeof vote.confidence !== 'number'
      || !Number.isFinite(vote.confidence)
      || vote.confidence < 0
      || vote.confidence > 1
      || typeof vote.rationale !== 'string'
      || vote.rationale.length === 0
      || vote.rationale.length > 500
    ) return false;
    agents.add(vote.agent);
  }

  return names.every((agent) => agents.has(agent));
}
