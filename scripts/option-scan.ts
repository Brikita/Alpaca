import { collectOptionScanBatch } from '../lib/option-scan.ts';
import { publishOptionScanBatch } from '../lib/telemetry-client.ts';

try {
  const batch = await collectOptionScanBatch();
  const endpoint = process.env.VOLGUARD_SCAN_URL;
  const token = process.env.VOLGUARD_TELEMETRY_TOKEN;
  if (endpoint && token) {
    await publishOptionScanBatch(
      batch,
      endpoint,
      token,
      process.env.VOLGUARD_SITES_BYPASS_TOKEN,
    );
  }
  process.stdout.write(`${JSON.stringify(batch, null, 2)}\n`);
  if (endpoint && token) {
    process.stdout.write('Published sanitized option scan to VolGuard.\n');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to collect Alpaca option scan: ${message}\n`);
  process.exitCode = 1;
}
