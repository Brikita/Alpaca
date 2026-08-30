import { isOptionScanBatch } from '../../../lib/option-scan-contract';
import {
  latestOptionScanBatch,
  saveOptionScanBatch,
  telemetryIngestToken,
} from '../../../lib/telemetry-store';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

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

export async function GET(): Promise<Response> {
  const batch = await latestOptionScanBatch();
  return Response.json(
    { batch },
    { headers: { 'cache-control': 'no-store, max-age=0' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = telemetryIngestToken();
  if (!expectedToken) {
    return Response.json({ error: 'Option scan ingestion is not configured.' }, { status: 503 });
  }

  const suppliedToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!suppliedToken || !(await secureEqual(suppliedToken, expectedToken))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Payload too large.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Payload too large.' }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (!isOptionScanBatch(payload)) {
    return Response.json({ error: 'Invalid option scan batch.' }, { status: 422 });
  }

  await saveOptionScanBatch(payload);
  return Response.json({ accepted: true, capturedAt: payload.capturedAt }, { status: 202 });
}
