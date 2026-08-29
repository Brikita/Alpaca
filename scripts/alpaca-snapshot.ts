import { collectAlpacaSnapshot } from '../lib/alpaca-snapshot.ts';
import { publishTelemetrySnapshot } from '../lib/telemetry-client.ts';

try {
  const snapshot = await collectAlpacaSnapshot();
  const endpoint = process.env.VOLGUARD_TELEMETRY_URL;
  const token = process.env.VOLGUARD_TELEMETRY_TOKEN;
  if (endpoint && token) {
    await publishTelemetrySnapshot(snapshot, endpoint, token);
  }
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (endpoint && token) {
    process.stdout.write('Published sanitized telemetry to VolGuard.\n');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to collect Alpaca paper snapshot: ${message}\n`);
  process.exitCode = 1;
}
