import type { OptionScan, OptionScanBatch } from './option-intelligence.ts';

export interface DecisionHistoryItem {
  id: string;
  capturedAt: string;
  expiration: string;
  symbol: string;
  status: OptionScan['status'];
  strategy: OptionScan['strategy'];
  confidence: number;
  checksPassed: number;
  checksTotal: number;
  reason: string;
}

export function summarizeDecisionHistory(
  batches: OptionScanBatch[],
  limit = 40,
): DecisionHistoryItem[] {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return batches
    .flatMap((batch) => batch.scans.map((scan) => {
      const failedCheck = scan.checks.find((check) => !check.passed);
      return {
        id: `${batch.capturedAt}:${scan.symbol}`,
        capturedAt: scan.capturedAt,
        expiration: scan.expiration,
        symbol: scan.symbol,
        status: scan.status,
        strategy: scan.strategy,
        confidence: scan.confidence,
        checksPassed: scan.checks.filter((check) => check.passed).length,
        checksTotal: scan.checks.length,
        reason: scan.status === 'candidate'
          ? 'All signal gates passed. Candidate only — not an order.'
          : failedCheck?.detail ?? scan.thesis,
      } satisfies DecisionHistoryItem;
    }))
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
    .slice(0, safeLimit);
}
