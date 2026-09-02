import { runAlpaca, type AlpacaEnvironment } from './alpaca-cli.ts';

export interface CatalystArticle {
  id: number;
  headline: string;
  source: string;
  createdAt: string;
  symbols: string[];
  url: string;
  highImpact: boolean;
}

export interface CatalystSnapshot {
  source: 'alpaca-news';
  capturedAt: string;
  status: 'clear' | 'risk' | 'unavailable';
  lookbackMinutes: number;
  highImpactCount: number;
  articles: CatalystArticle[];
  rationale: string;
}

interface AlpacaNewsResponse {
  news?: Array<{
    id?: number;
    headline?: string;
    source?: string;
    created_at?: string;
    symbols?: string[];
    url?: string;
  }>;
}

const HIGH_IMPACT_PATTERN = /\b(FOMC|FED(?:ERAL RESERVE)?|RATE (?:HIKE|CUT)|CPI|INFLATION|PAYROLLS?|JOBS? REPORT|UNEMPLOYMENT|GDP|TARIFFS?|SANCTIONS?|WAR|ATTACK|MISSILE|CEASEFIRE|TREASUR(?:Y|IES)|OIL INVENTOR(?:Y|IES))\b/i;

export async function collectCatalystSnapshot(
  symbols: readonly string[],
  environment: AlpacaEnvironment = process.env,
  now = new Date(),
  lookbackMinutes = 120,
): Promise<CatalystSnapshot> {
  const start = new Date(now.getTime() - lookbackMinutes * 60_000).toISOString();
  try {
    const result = await runAlpaca<AlpacaNewsResponse>([
      'data', 'news', '--symbols', symbols.join(','), '--start', start,
      '--end', now.toISOString(), '--limit', '20', '--sort', 'desc',
    ], environment);
    const articles = (result.data.news ?? []).flatMap((article) => {
      if (!article.id || !article.headline || !article.created_at) return [];
      return [{
        id: article.id,
        headline: article.headline.slice(0, 220),
        source: article.source ?? 'alpaca-news',
        createdAt: article.created_at,
        symbols: article.symbols ?? [],
        url: article.url ?? '',
        highImpact: HIGH_IMPACT_PATTERN.test(article.headline),
      } satisfies CatalystArticle];
    });
    const highImpactCount = articles.filter((article) => article.highImpact).length;
    return {
      source: 'alpaca-news',
      capturedAt: now.toISOString(),
      status: highImpactCount > 0 ? 'risk' : 'clear',
      lookbackMinutes,
      highImpactCount,
      articles,
      rationale: highImpactCount > 0
        ? `${highImpactCount} potentially market-moving verified headline${highImpactCount === 1 ? '' : 's'} appeared in the last ${lookbackMinutes} minutes.`
        : `Alpaca returned ${articles.length} verified headline${articles.length === 1 ? '' : 's'} with no configured high-impact catalyst match.`,
    };
  } catch (error) {
    return {
      source: 'alpaca-news',
      capturedAt: now.toISOString(),
      status: 'unavailable',
      lookbackMinutes,
      highImpactCount: 0,
      articles: [],
      rationale: `Verified Alpaca news was unavailable: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown error'}`,
    };
  }
}
