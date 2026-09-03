import { automationPermission, parseAutomationStatus } from './automation-control.ts';

export async function requireAutomationPermission(
  operation: 'entry' | 'exit',
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const base = environment.VOLGUARD_CONTROL_URL ?? environment.VOLGUARD_TELEMETRY_URL;
  if (!base) throw new Error('Automation control is not configured; submission is blocked.');
  const endpoint = new URL(environment.VOLGUARD_CONTROL_URL ? '/status' : '/api/automation', base);
  const headers: Record<string, string> = {};
  if (!environment.VOLGUARD_CONTROL_URL && environment.VOLGUARD_SITES_BYPASS_TOKEN) {
    headers['OAI-Sites-Authorization'] = `Bearer ${environment.VOLGUARD_SITES_BYPASS_TOKEN}`;
  }
  const response = await fetchImpl(endpoint, { headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Automation status is unavailable (${response.status}); submission is blocked.`);
  const status = parseAutomationStatus(await response.json());
  if (!automationPermission(status, operation)) {
    throw new Error(`${operation === 'entry' ? 'Entry' : 'Exit'} submission blocked: ${status?.reason ?? 'unverified automation control'}`);
  }
}
