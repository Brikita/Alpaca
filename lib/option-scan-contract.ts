import type {
  OptionContractQuote,
  OptionScan,
  OptionScanBatch,
  ScanCheck,
} from './option-intelligence.ts';
import type { CatalystSnapshot } from './catalyst.ts';
import type { MarketCalendarSession } from './market-calendar.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

const checkIds = new Set<ScanCheck['id']>([
  'session', 'history', 'pair', 'liquidity', 'freshness', 'edge',
]);
const statuses = new Set<OptionScan['status']>(['candidate', 'abstain', 'unavailable']);
const strategies = new Set<OptionScan['strategy']>([
  'iron_condor', 'long_iron_butterfly', 'long_straddle', 'bull_call_spread', 'bear_put_spread', 'abstain',
]);
const directions = new Set<OptionScan['direction']>(['bullish', 'bearish', 'neutral']);
const optionTypes = new Set<OptionContractQuote['type']>(['call', 'put']);
const catalystStatuses = new Set<CatalystSnapshot['status']>(['clear', 'risk', 'unavailable']);

function isCatalystSnapshot(value: unknown): value is CatalystSnapshot {
  if (!isRecord(value)
    || value.source !== 'alpaca-news'
    || typeof value.capturedAt !== 'string'
    || typeof value.status !== 'string'
    || !catalystStatuses.has(value.status as CatalystSnapshot['status'])
    || !isFiniteNumber(value.lookbackMinutes)
    || value.lookbackMinutes <= 0
    || !isFiniteNumber(value.highImpactCount)
    || value.highImpactCount < 0
    || typeof value.rationale !== 'string'
    || value.rationale.length > 500
    || !Array.isArray(value.articles)
    || value.articles.length > 20) return false;
  return value.articles.every((article) => isRecord(article)
    && isFiniteNumber(article.id)
    && typeof article.headline === 'string'
    && article.headline.length <= 220
    && typeof article.source === 'string'
    && typeof article.createdAt === 'string'
    && Array.isArray(article.symbols)
    && article.symbols.every((symbol) => typeof symbol === 'string')
    && typeof article.url === 'string'
    && typeof article.highImpact === 'boolean');
}

function isMarketCalendarSession(value: unknown): value is MarketCalendarSession {
  return isRecord(value)
    && typeof value.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    && typeof value.open === 'string'
    && /^\d{2}:\d{2}$/.test(value.open)
    && typeof value.close === 'string'
    && /^\d{2}:\d{2}$/.test(value.close)
    && typeof value.sessionOpen === 'string'
    && /^\d{4}$/.test(value.sessionOpen)
    && typeof value.sessionClose === 'string'
    && /^\d{4}$/.test(value.sessionClose);
}

function isOptionContractQuote(value: unknown): value is OptionContractQuote {
  return isRecord(value)
    && typeof value.symbol === 'string'
    && typeof value.type === 'string'
    && optionTypes.has(value.type as OptionContractQuote['type'])
    && isFiniteNumber(value.strike)
    && value.strike > 0
    && isFiniteNumber(value.bid)
    && value.bid > 0
    && isFiniteNumber(value.ask)
    && value.ask >= value.bid
    && isFiniteNumber(value.mid)
    && value.mid > 0
    && isFiniteNumber(value.spreadPct)
    && value.spreadPct >= 0
    && isFiniteNumber(value.quoteAgeSeconds)
    && value.quoteAgeSeconds >= 0
    && isFiniteNumber(value.volume)
    && value.volume >= 0;
}

function isScanCheck(value: unknown): value is ScanCheck {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    checkIds.has(value.id as ScanCheck['id']) &&
    typeof value.label === 'string' &&
    typeof value.passed === 'boolean' &&
    typeof value.detail === 'string'
  );
}

function isOptionScan(value: unknown): value is OptionScan {
  if (!isRecord(value)) return false;
  if (
    typeof value.symbol !== 'string' ||
    typeof value.capturedAt !== 'string' ||
    typeof value.expiration !== 'string' ||
    typeof value.status !== 'string' ||
    !statuses.has(value.status as OptionScan['status']) ||
    typeof value.strategy !== 'string' ||
    !strategies.has(value.strategy as OptionScan['strategy']) ||
    typeof value.thesis !== 'string' ||
    typeof value.direction !== 'string' ||
    !directions.has(value.direction as OptionScan['direction']) ||
    !isFiniteNumber(value.confidence) ||
    !isFiniteNumber(value.directionalConfidence) ||
    !isFiniteNumber(value.combinedVolume)
  ) return false;

  const nullableNumbers = [
    value.underlyingPrice,
    value.atmStrike,
    value.callMid,
    value.putMid,
    value.modelMovePct,
    value.impliedMovePct,
    value.spreadPct,
    value.quoteAgeSeconds,
  ];
  if (!nullableNumbers.every(isNullableFiniteNumber)) return false;
  if (!isNullableString(value.callSymbol) || !isNullableString(value.putSymbol)) return false;
  if (!Array.isArray(value.contracts) || value.contracts.length > 200 || !value.contracts.every(isOptionContractQuote)) {
    return false;
  }
  if (!Array.isArray(value.checks) || value.checks.length !== checkIds.size || !value.checks.every(isScanCheck)) {
    return false;
  }
  return new Set(value.checks.map((check) => check.id)).size === checkIds.size;
}

export function isOptionScanBatch(value: unknown): value is OptionScanBatch {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.source === 'alpaca-cli' &&
    value.mode === 'paper' &&
    typeof value.capturedAt === 'string' &&
    typeof value.marketOpen === 'boolean' &&
    typeof value.targetExpiration === 'string' &&
    Array.isArray(value.universe) &&
    value.universe.every((symbol) => typeof symbol === 'string') &&
    Array.isArray(value.scans) &&
    value.scans.every(isOptionScan) &&
    isNullableString(value.leaderSymbol) &&
    isFiniteNumber(value.candidateCount) &&
    value.candidateCount === value.scans.filter((scan) => scan.status === 'candidate').length &&
    (value.catalyst === undefined || isCatalystSnapshot(value.catalyst)) &&
    (value.calendar === undefined || (
      Array.isArray(value.calendar) &&
      value.calendar.length <= 30 &&
      value.calendar.every(isMarketCalendarSession)
    ))
  );
}
