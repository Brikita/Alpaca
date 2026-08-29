import { collectAlpacaSnapshot } from '../lib/alpaca-snapshot.ts';

try {
  const snapshot = await collectAlpacaSnapshot();
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to collect Alpaca paper snapshot: ${message}\n`);
  process.exitCode = 1;
}
