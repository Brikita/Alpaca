import type { AlpacaSnapshot } from './alpaca-snapshot.ts';
import type { OptionScanBatch } from './option-intelligence.ts';

async function publishPayload(
  payload: unknown,
  endpoint: string,
  token: string,
  label: string,
  sitesBypassToken?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  if (sitesBypassToken) {
    headers['OAI-Sites-Authorization'] = `Bearer ${sitesBypassToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${label} publish failed (${response.status}): ${message}`);
  }
}

export async function publishTelemetrySnapshot(
  snapshot: AlpacaSnapshot,
  endpoint: string,
  token: string,
  sitesBypassToken?: string,
): Promise<void> {
  await publishPayload(snapshot, endpoint, token, 'Telemetry', sitesBypassToken);
}

export async function publishOptionScanBatch(
  batch: OptionScanBatch,
  endpoint: string,
  token: string,
  sitesBypassToken?: string,
): Promise<void> {
  await publishPayload(batch, endpoint, token, 'Option scan', sitesBypassToken);
}
