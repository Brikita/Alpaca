import type { AlpacaSnapshot } from '../lib/alpaca-snapshot.ts';
import type { OptionScanBatch } from '../lib/option-intelligence.ts';
import { constructPosition, toTradeProposal } from '../lib/position-constructor.ts';
import { evaluateProposal } from '../lib/risk-governor.ts';

function privateHeaders(): Record<string, string> {
  const token = process.env.VOLGUARD_SITES_BYPASS_TOKEN;
  return token ? { 'OAI-Sites-Authorization': `Bearer ${token}` } : {};
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: privateHeaders() });
  if (!response.ok) throw new Error(`Read failed (${response.status}) for ${url}`);
  return response.json() as Promise<T>;
}

try {
  const telemetryUrl = process.env.VOLGUARD_TELEMETRY_URL;
  const scanUrl = process.env.VOLGUARD_SCAN_URL;
  if (!telemetryUrl || !scanUrl) throw new Error('VolGuard telemetry and scan URLs are required.');

  const [{ snapshot }, { batch }] = await Promise.all([
    readJson<{ snapshot: AlpacaSnapshot | null }>(telemetryUrl),
    readJson<{ batch: OptionScanBatch | null }>(scanUrl),
  ]);
  if (!snapshot || !batch) throw new Error('The hosted account snapshot and option scan are required.');
  if (snapshot.positions.length > 0) {
    throw new Error('Open-position maximum risk is not modeled yet; evaluation stopped safely.');
  }
  const leader = batch.scans.find((scan) => scan.symbol === batch.leaderSymbol);
  if (!leader) throw new Error('The latest scan has no leader.');

  const construction = constructPosition(leader);
  if (construction.status === 'blocked') {
    process.stdout.write(`${JSON.stringify({ leader: leader.symbol, signalStatus: leader.status, construction }, null, 2)}\n`);
  } else {
    const proposal = toTradeProposal(construction.position);
    const dailyDrawdown = Math.max(0, snapshot.account.previousEquity - snapshot.account.equity);
    const competitionDrawdown = Math.max(0, 100_000 - snapshot.account.equity);
    const decision = evaluateProposal(proposal, {
      openRisk: 0,
      dailyDrawdown,
      competitionDrawdown,
    });
    process.stdout.write(`${JSON.stringify({
      leader: leader.symbol,
      signalStatus: leader.status,
      position: construction.position,
      riskDecision: decision,
    }, null, 2)}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Unable to evaluate latest scan: ${message}\n`);
  process.exitCode = 1;
}
