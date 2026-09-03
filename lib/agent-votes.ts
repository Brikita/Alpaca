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
  if (!Array.isArray(value) || value.length !== REQUIRED_AGENT_NAMES.length) return false;

  const required = new Set<string>(REQUIRED_AGENT_NAMES);
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

  return REQUIRED_AGENT_NAMES.every((agent) => agents.has(agent));
}
