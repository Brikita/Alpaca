import type { Direction, Strategy } from './domain.ts';
import type { OptionScan, OptionScanBatch } from './option-intelligence.ts';

export const DECISION_MEMORY_POLICY = {
  lookbackMinutes: 60,
  maxObservations: 6,
  minConfirmations: 2,
  minAgreementRatio: 0.6,
} as const;

export type DecisionMemoryStatus = 'confirmed' | 'mixed' | 'insufficient' | 'no_candidate';

export interface DecisionMemory {
  schemaVersion: 1;
  symbol: string;
  generatedAt: string;
  status: DecisionMemoryStatus;
  approved: boolean;
  confidence: number;
  lookbackMinutes: number;
  observations: number;
  confirmations: number;
  agreementRatio: number | null;
  currentStrategy: Strategy;
  currentDirection: Direction;
  signalStrengthStart: number | null;
  signalStrengthCurrent: number | null;
  medianSpreadPct: number | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  rationale: string;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function signalStrength(scan: OptionScan): number | null {
  if (scan.strategy === 'bull_call_spread' || scan.strategy === 'bear_put_spread') {
    return round(scan.directionalConfidence);
  }
  if (!finite(scan.modelMovePct) || !finite(scan.impliedMovePct) || scan.modelMovePct <= 0 || scan.impliedMovePct <= 0) {
    return null;
  }
  if (scan.strategy === 'iron_condor') return round(scan.impliedMovePct / scan.modelMovePct);
  if (scan.strategy === 'long_straddle' || scan.strategy === 'long_iron_butterfly') {
    return round(scan.modelMovePct / scan.impliedMovePct);
  }
  return null;
}

function fingerprint(scan: OptionScan): string {
  return `${scan.strategy}:${scan.direction}`;
}

function scanFor(batch: OptionScanBatch, symbol: string): OptionScan | undefined {
  return batch.scans.find((scan) => scan.symbol === symbol);
}

function emptyMemory(current: OptionScan, generatedAt: string, rationale: string): DecisionMemory {
  return {
    schemaVersion: 1,
    symbol: current.symbol,
    generatedAt,
    status: 'no_candidate',
    approved: false,
    confidence: 0,
    lookbackMinutes: DECISION_MEMORY_POLICY.lookbackMinutes,
    observations: 0,
    confirmations: 0,
    agreementRatio: null,
    currentStrategy: current.strategy,
    currentDirection: current.direction,
    signalStrengthStart: null,
    signalStrengthCurrent: signalStrength(current),
    medianSpreadPct: null,
    firstObservedAt: null,
    lastObservedAt: null,
    rationale,
  };
}

export function buildDecisionMemories(batches: OptionScanBatch[]): DecisionMemory[] {
  const ordered = [...batches].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  const currentBatch = ordered[0];
  if (!currentBatch) return [];

  const generatedAt = currentBatch.capturedAt;
  const generatedMs = new Date(generatedAt).getTime();
  const earliestMs = generatedMs - DECISION_MEMORY_POLICY.lookbackMinutes * 60_000;

  return currentBatch.scans.map((current) => {
    if (!currentBatch.marketOpen) {
      return emptyMemory(current, generatedAt, `${current.symbol} memory is observation-only because the latest scan occurred outside the market session.`);
    }
    if (current.status !== 'candidate' || current.strategy === 'abstain') {
      return emptyMemory(current, generatedAt, `${current.symbol} has no current candidate to confirm; memory cannot turn an abstention into a trade.`);
    }

    const observations = ordered
      .filter((batch) => {
        const capturedMs = new Date(batch.capturedAt).getTime();
        return batch.marketOpen && capturedMs >= earliestMs && capturedMs <= generatedMs;
      })
      .map((batch) => scanFor(batch, current.symbol))
      .filter((scan): scan is OptionScan => Boolean(scan) && scan!.status !== 'unavailable')
      .slice(0, DECISION_MEMORY_POLICY.maxObservations)
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
    const aligned = observations.filter((scan) => scan.status === 'candidate' && fingerprint(scan) === fingerprint(current));
    const agreementRatio = observations.length ? aligned.length / observations.length : null;
    const enoughHistory = observations.length >= DECISION_MEMORY_POLICY.minConfirmations;
    const enoughConfirmations = aligned.length >= DECISION_MEMORY_POLICY.minConfirmations;
    const enoughAgreement = agreementRatio !== null && agreementRatio >= DECISION_MEMORY_POLICY.minAgreementRatio;
    const approved = enoughHistory && enoughConfirmations && enoughAgreement;
    const status: DecisionMemoryStatus = approved
      ? 'confirmed'
      : enoughHistory && aligned.length > 0
        ? 'mixed'
        : 'insufficient';
    const strengths = aligned.map(signalStrength).filter((value): value is number => value !== null);
    const spreads = observations.map((scan) => scan.spreadPct).filter((value): value is number => finite(value));
    const firstObservedAt = observations[0]?.capturedAt ?? null;
    const lastObservedAt = observations.at(-1)?.capturedAt ?? null;
    const elapsedMinutes = firstObservedAt && lastObservedAt
      ? Math.max(0, Math.round((new Date(lastObservedAt).getTime() - new Date(firstObservedAt).getTime()) / 60_000))
      : 0;
    const agreementText = agreementRatio === null ? '0%' : `${Math.round(agreementRatio * 100)}%`;
    const rationale = approved
      ? `${current.symbol} ${current.strategy} ${current.direction} is confirmed in ${aligned.length}/${observations.length} open-market scans over ${elapsedMinutes}m (${agreementText} agreement).`
      : `${current.symbol} needs ${DECISION_MEMORY_POLICY.minConfirmations} matching open-market scans; ${aligned.length}/${observations.length} currently agree on ${current.strategy} ${current.direction} (${agreementText}).`;

    return {
      schemaVersion: 1,
      symbol: current.symbol,
      generatedAt,
      status,
      approved,
      confidence: round(agreementRatio ?? 0),
      lookbackMinutes: DECISION_MEMORY_POLICY.lookbackMinutes,
      observations: observations.length,
      confirmations: aligned.length,
      agreementRatio: agreementRatio === null ? null : round(agreementRatio),
      currentStrategy: current.strategy,
      currentDirection: current.direction,
      signalStrengthStart: strengths[0] ?? null,
      signalStrengthCurrent: strengths.at(-1) ?? null,
      medianSpreadPct: median(spreads) === null ? null : round(median(spreads)!),
      firstObservedAt,
      lastObservedAt,
      rationale,
    };
  });
}

