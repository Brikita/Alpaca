import type { AlpacaSnapshot } from './alpaca-snapshot.ts';

export async function publishTelemetrySnapshot(
  snapshot: AlpacaSnapshot,
  endpoint: string,
  token: string,
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
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Telemetry publish failed (${response.status}): ${message}`);
  }
}
