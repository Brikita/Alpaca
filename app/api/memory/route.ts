import { buildDecisionMemories, DECISION_MEMORY_POLICY } from '../../../lib/decision-memory';
import { recentOptionScanBatches } from '../../../lib/telemetry-store';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const batches = await recentOptionScanBatches(18);
  const memories = buildDecisionMemories(batches);
  return Response.json({
    generatedAt: memories[0]?.generatedAt ?? null,
    policy: DECISION_MEMORY_POLICY,
    memories,
  }, { headers: { 'cache-control': 'no-store, max-age=0' } });
}

