import { runAlpaca, type AlpacaEnvironment } from './alpaca-cli.ts';
import {
  buildOptionScan,
  buildUnavailableScan,
  chooseScanLeader,
  stockReferencePrice,
  type OptionChainResponse,
  type OptionScan,
  type OptionScanBatch,
  type PriceBar,
  type StockSnapshot,
} from './option-intelligence.ts';

interface AlpacaClockResponse {
  is_open?: boolean;
}

interface BarsResponse {
  bars?: PriceBar[];
}

export const DEFAULT_OPTION_UNIVERSE = ['SPY', 'QQQ', 'IWM', 'GLD'] as const;

export function describeCollectorError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const payload = JSON.parse(raw) as { error?: unknown; hint?: unknown };
    if (typeof payload.error === 'string') return payload.error;
    if (typeof payload.hint === 'string') return payload.hint;
  } catch {
    // The CLI may also return ordinary text; sanitize it below.
  }
  const line = raw.split(/\r?\n/).find((value) => value.trim())?.trim() ?? 'Unknown collection error';
  return line.slice(0, 180);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function targetFriday(from: Date): string {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 3));
  for (let offset = 0; offset < 8; offset += 1) {
    if (cursor.getUTCDay() === 5) return dateOnly(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  throw new Error('Unable to select an option expiration.');
}

async function collectSymbol(
  symbol: string,
  capturedAt: string,
  expiration: string,
  marketOpen: boolean,
  environment: AlpacaEnvironment,
): Promise<OptionScan> {
  try {
    const stock = (await runAlpaca<StockSnapshot>(['data', 'snapshot', '--symbol', symbol], environment)).data;
    const reference = stockReferencePrice(stock);
    if (!reference) return buildUnavailableScan({ symbol, capturedAt, expiration, marketOpen }, 'Underlying price unavailable');

    const start = new Date(capturedAt);
    start.setUTCDate(start.getUTCDate() - 45);
    const lowerStrike = Math.floor(reference * 0.98);
    const upperStrike = Math.ceil(reference * 1.02);
    const [bars, chain] = await Promise.all([
      runAlpaca<BarsResponse>([
        'data', 'bars', '--symbol', symbol, '--start', dateOnly(start), '--end', capturedAt.slice(0, 10),
        '--timeframe', '1Day', '--limit', '1000', '--feed', 'iex',
      ], environment, 60_000),
      runAlpaca<OptionChainResponse>([
        'data', 'option', 'chain', '--underlying-symbol', symbol, '--expiration-date', expiration,
        '--strike-price-gte', String(lowerStrike), '--strike-price-lte', String(upperStrike), '--limit', '1000',
      ], environment, 60_000),
    ]);
    return buildOptionScan({
      symbol,
      capturedAt,
      expiration,
      marketOpen,
      stock,
      bars: bars.data.bars ?? [],
      chain: chain.data,
    });
  } catch (error) {
    const detail = describeCollectorError(error);
    return buildUnavailableScan({ symbol, capturedAt, expiration, marketOpen }, detail);
  }
}

export async function collectOptionScanBatch(
  universe: readonly string[] = DEFAULT_OPTION_UNIVERSE,
  environment: AlpacaEnvironment = process.env,
  now = new Date(),
): Promise<OptionScanBatch> {
  const safeEnvironment = { ...environment, ALPACA_LIVE_TRADE: 'false' };
  const capturedAt = now.toISOString();
  const expiration = targetFriday(now);
  const clock = await runAlpaca<AlpacaClockResponse>(['clock'], safeEnvironment);
  const marketOpen = Boolean(clock.data.is_open);
  const scans = await Promise.all(
    universe.map((symbol) => collectSymbol(symbol, capturedAt, expiration, marketOpen, safeEnvironment)),
  );
  return {
    schemaVersion: 1,
    source: 'alpaca-cli',
    mode: 'paper',
    capturedAt,
    marketOpen,
    targetExpiration: expiration,
    universe: [...universe],
    scans,
    leaderSymbol: chooseScanLeader(scans),
    candidateCount: scans.filter((scan) => scan.status === 'candidate').length,
  };
}
