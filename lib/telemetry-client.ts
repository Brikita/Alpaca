import type { AlpacaSnapshot } from './alpaca-snapshot.ts';
import type { OptionScanBatch } from './option-intelligence.ts';
import type { PaperOrderEvent } from './paper-order.ts';
import type { StrategyReplay } from './replay.ts';

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

export async function publishPaperOrderEvent(
  event: PaperOrderEvent,
  endpoint: string,
  token: string,
  sitesBypassToken?: string,
): Promise<void> {
  await publishPayload(event, endpoint, token, 'Paper order event', sitesBypassToken);
}

export async function publishStrategyReplay(
  replay: StrategyReplay,
  endpoint: string,
  token: string,
  sitesBypassToken?: string,
): Promise<void> {
  await publishPayload(replay, endpoint, token, 'Strategy replay', sitesBypassToken);
}
