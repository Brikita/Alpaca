import { latestStrategyReplay, saveStrategyReplay, telemetryIngestToken } from '../../../lib/telemetry-store';
import type { StrategyReplay } from '../../../lib/replay';

export const dynamic = 'force-dynamic';

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function isReplay(value: unknown): value is StrategyReplay {
  if (!value || typeof value !== 'object') return false;
  const replay = value as Partial<StrategyReplay>;
  return replay.schemaVersion === 1 && replay.source === 'alpaca-daily-bars'
    && typeof replay.capturedAt === 'string' && Array.isArray(replay.results)
    && replay.results.length <= 20;
}

export async function GET(): Promise<Response> {
  return Response.json({ replay: await latestStrategyReplay() }, {
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const expected = telemetryIngestToken();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || !supplied || !(await secureEqual(supplied, expected))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!isReplay(payload)) return Response.json({ error: 'Invalid replay.' }, { status: 422 });
  await saveStrategyReplay(payload);
  return Response.json({ accepted: true, capturedAt: payload.capturedAt }, { status: 202 });
}
