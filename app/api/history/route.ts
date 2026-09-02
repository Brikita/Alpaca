import { summarizeDecisionHistory } from '../../../lib/decision-history';
import {
  paperOrderLifecycleEvents,
  recentOptionScanBatches,
  recentPaperOrderEvents,
} from '../../../lib/telemetry-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const [batches, recentTrades, lifecycleTrades] = await Promise.all([
    recentOptionScanBatches(),
    recentPaperOrderEvents(),
    paperOrderLifecycleEvents(),
  ]);
  const trades = [...new Map([...recentTrades, ...lifecycleTrades]
    .map((event) => [event.eventKey, event])).values()]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  return Response.json(
    { decisions: summarizeDecisionHistory(batches), trades },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}
