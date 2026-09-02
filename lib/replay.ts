import { runAlpaca, type AlpacaEnvironment } from './alpaca-cli.ts';
import type { PriceBar } from './option-intelligence.ts';

export interface ReplaySymbolResult {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number | null;
  expectancyPct: number | null;
  cumulativeSignalReturnPct: number;
  baselineReturnPct: number;
  maxDrawdownPct: number;
}

export interface StrategyReplay {
  schemaVersion: 1;
  source: 'alpaca-daily-bars';
  capturedAt: string;
  start: string;
  end: string;
  holdingSessions: number;
  disclosure: string;
  results: ReplaySymbolResult[];
}

interface BarsResponse { bars?: PriceBar[] }

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export function replaySymbol(symbol: string, inputBars: PriceBar[], holdingSessions = 5): ReplaySymbolResult {
  const bars = inputBars.filter((bar) => Number.isFinite(bar.c) && bar.c > 0)
    .sort((left, right) => left.t.localeCompare(right.t));
  const outcomes: number[] = [];
  for (let index = 21; index + holdingSessions < bars.length; index += 1) {
    const window = bars.slice(index - 20, index + 1);
    const returns = window.slice(1).map((bar, offset) => Math.log(bar.c / window[offset].c));
    const noise = deviation(returns) * Math.sqrt(holdingSessions);
    const momentum = (bars[index].c / bars[index - holdingSessions].c) - 1;
    if (!noise || Math.abs(momentum) < noise) continue;
    const direction = momentum > 0 ? 1 : -1;
    outcomes.push(direction * ((bars[index + holdingSessions].c / bars[index].c) - 1) * 100);
    index += holdingSessions - 1;
  }
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const outcome of outcomes) {
    cumulative += outcome;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  const wins = outcomes.filter((value) => value > 0).length;
  const baseline = bars.length > 1 ? ((bars.at(-1)!.c / bars[0].c) - 1) * 100 : 0;
  return {
    symbol,
    trades: outcomes.length,
    wins,
    winRate: outcomes.length ? round((wins / outcomes.length) * 100) : null,
    expectancyPct: outcomes.length ? round(cumulative / outcomes.length) : null,
    cumulativeSignalReturnPct: round(cumulative),
    baselineReturnPct: round(baseline),
    maxDrawdownPct: round(maxDrawdown),
  };
}

export async function collectStrategyReplay(
  symbols: readonly string[],
  environment: AlpacaEnvironment = process.env,
  now = new Date(),
): Promise<StrategyReplay> {
  const startDate = new Date(now);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
  const start = startDate.toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const results = await Promise.all(symbols.map(async (symbol) => {
    const response = await runAlpaca<BarsResponse>([
      'data', 'bars', '--symbol', symbol, '--start', start, '--end', end,
      '--timeframe', '1Day', '--limit', '1000', '--feed', 'iex', '--adjustment', 'split',
    ], environment, 60_000);
    return replaySymbol(symbol, response.data.bars ?? []);
  }));
  return {
    schemaVersion: 1,
    source: 'alpaca-daily-bars',
    capturedAt: now.toISOString(),
    start,
    end,
    holdingSessions: 5,
    disclosure: 'Underlying signal replay only. It excludes option pricing, fills, fees, and slippage and is not a prediction of live performance.',
    results,
  };
}
