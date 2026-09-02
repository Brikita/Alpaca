import { DEFAULT_OPTION_UNIVERSE } from '../lib/option-scan.ts';
import { collectStrategyReplay } from '../lib/replay.ts';
import { publishStrategyReplay } from '../lib/telemetry-client.ts';

try {
  const replay = await collectStrategyReplay(DEFAULT_OPTION_UNIVERSE, {
    ...process.env, ALPACA_LIVE_TRADE: 'false',
  });
  const scanUrl = process.env.VOLGUARD_SCAN_URL;
  const token = process.env.VOLGUARD_TELEMETRY_TOKEN;
  if (scanUrl && token) {
    await publishStrategyReplay(
      replay,
      process.env.VOLGUARD_REPLAY_URL ?? new URL('/api/replays', scanUrl).toString(),
      token,
      process.env.VOLGUARD_SITES_BYPASS_TOKEN,
    );
  }
  process.stdout.write(`${JSON.stringify(replay, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Strategy replay stopped: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
