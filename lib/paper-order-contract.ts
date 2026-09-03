import type { PaperOrderEvent } from './paper-order.ts';
import { isCompleteAgentVoteSet, isLegacyAgentVoteSet } from './agent-votes.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPaperOrderEvent(value: unknown): value is PaperOrderEvent {
  if (!isRecord(value)) return false;
  if (
    (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || value.source !== 'volguard-runner'
    || value.mode !== 'paper'
    || typeof value.eventKey !== 'string'
    || ![
      'previewed', 'submitted', 'rejected', 'reconciled', 'monitored',
      'exit_previewed', 'exit_submitted', 'exit_rejected', 'exit_reconciled',
    ].includes(String(value.eventType))
    || typeof value.recordedAt !== 'string'
    || typeof value.proposalId !== 'string'
    || typeof value.clientOrderId !== 'string'
    || !value.clientOrderId.startsWith('volguard-')
    || typeof value.symbol !== 'string'
    || typeof value.strategy !== 'string'
    || typeof value.expiration !== 'string'
    || !finite(value.quantity)
    || !finite(value.limitDebit)
    || !finite(value.maxLoss)
    || !(value.maxProfit === null || finite(value.maxProfit))
    || typeof value.brokerStatus !== 'string'
    || !finite(value.filledQuantity)
    || !(value.filledAveragePrice === null || finite(value.filledAveragePrice))
    || typeof value.message !== 'string'
  ) return false;
  if (!Array.isArray(value.legs) || value.legs.length < 2 || value.legs.length > 4) return false;
  if (!value.legs.every((leg) => isRecord(leg)
    && typeof leg.symbol === 'string'
    && ['buy', 'sell'].includes(String(leg.side))
    && ['buy_to_open', 'sell_to_open', 'buy_to_close', 'sell_to_close'].includes(String(leg.positionIntent))
    && leg.ratioQuantity === 1
  )) return false;
  const isExitEvent = ['monitored', 'exit_previewed', 'exit_submitted', 'exit_rejected', 'exit_reconciled']
    .includes(String(value.eventType));
  const isMaintenanceEvent = isExitEvent || value.eventType === 'reconciled';
  if (value.schemaVersion === 1) {
    // Only lifecycle maintenance may ingest legacy evidence; new entries use v2.
    if (!isMaintenanceEvent
      || !(isLegacyAgentVoteSet(value.councilVotes) || isCompleteAgentVoteSet(value.councilVotes))
    ) return false;
  } else if (!isCompleteAgentVoteSet(value.councilVotes)) return false;
  if (!isRecord(value.riskDecision)
    || value.riskDecision.approved !== true
    || value.riskDecision.passed !== value.riskDecision.total
    || !Array.isArray(value.riskDecision.gates)
  ) return false;
  if (isExitEvent) {
    if (!isRecord(value.exit)
      || typeof value.exit.entryClientOrderId !== 'string'
      || !['profit_target', 'loss_limit', 'time_exit', 'hold'].includes(String(value.exit.reason))
      || !finite(value.exit.entryDebit)
      || !finite(value.exit.closeCredit)
      || !finite(value.exit.unrealizedPnl)
      || !finite(value.exit.profitTarget)
      || !finite(value.exit.lossLimit)
      || typeof value.exit.timeExitAt !== 'string'
      || !finite(value.exit.quoteAgeSeconds)
      || typeof value.exit.quoteFresh !== 'boolean'
      || typeof value.exit.positionMatched !== 'boolean'
      || !(value.exit.realizedPnl === null || finite(value.exit.realizedPnl))
    ) return false;
  }
  return value.maxLoss > 0 && value.maxLoss <= DEFAULT_MAX_LOSS;
}

const DEFAULT_MAX_LOSS = 500;
