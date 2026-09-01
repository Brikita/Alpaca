import { summarizeDecisionHistory } from '../../../lib/decision-history';
import { recentOptionScanBatches } from '../../../lib/telemetry-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const batches = await recentOptionScanBatches();
  return Response.json(
    { decisions: summarizeDecisionHistory(batches) },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}
