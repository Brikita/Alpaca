import type { AlpacaSnapshot } from './alpaca-snapshot.ts';

export async function publishTelemetrySnapshot(
  snapshot: AlpacaSnapshot,
  endpoint: string,
  token: string,
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Telemetry publish failed (${response.status}): ${message}`);
  }
}
