import { summarizeDecisionHistory } from '../../../lib/decision-history';
import { recentOptionScanBatches, recentPaperOrderEvents } from '../../../lib/telemetry-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const [batches, trades] = await Promise.all([
    recentOptionScanBatches(),
    recentPaperOrderEvents(),
  ]);
  return Response.json(
    { decisions: summarizeDecisionHistory(batches), trades },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}
