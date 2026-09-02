import { calculateTradePerformance } from '../../../lib/performance-analytics';
import { latestStrategyReplay, paperOrderLifecycleEvents } from '../../../lib/telemetry-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const [events, replay] = await Promise.all([
    paperOrderLifecycleEvents(), latestStrategyReplay(),
  ]);
  return Response.json({ actual: calculateTradePerformance(events), replay }, {
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}
