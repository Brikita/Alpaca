import assert from 'node:assert/strict';
import test from 'node:test';
import { automationLabel, automationPermission, changeAutomationControl, normalizeStoredControl, parseAutomationStatus, type AutomationStatus } from '../lib/automation-control.ts';
import { requireAutomationPermission } from '../lib/automation-client.ts';

const now = '2026-09-03T14:00:00.000Z';
const active = normalizeStoredControl(undefined);
function status(control = active): AutomationStatus {
  return { ...control, mode: 'paper', observedAt: now, exitCadenceMinutes: 5, entryCadenceMinutes: 10,
    dispatchWindow: 'Weekday regular session', dispatchEligibleNow: true };
}

test('pausing entries preserves exits; a full halt blocks both', () => {
  const paused = changeAutomationControl(active, 'pause', 'Review setups', 'operator', '123', now);
  assert.equal(automationPermission(status(paused), 'entry', Date.parse(now)), false);
  assert.equal(automationPermission(status(paused), 'exit', Date.parse(now)), true);
  assert.equal(automationLabel(status(paused), Date.parse(now)), 'Entries paused');
  const halted = changeAutomationControl(paused, 'halt_all', 'Investigate broker state');
  assert.equal(automationPermission(status(halted), 'exit', Date.parse(now)), false);
  assert.equal(changeAutomationControl(halted, 'pause', 'Still reviewing').haltAll, true);
  assert.equal(changeAutomationControl(halted, 'resume', 'Reviewed').haltAll, false);
});

test('an existing emergency pause is not weakened by deployment or by a normal pause', () => {
  const migrated = normalizeStoredControl({ paused: true, reason: 'Emergency' });
  assert.equal(migrated.controlMode, 'halt_all');
  assert.equal(changeAutomationControl(migrated, 'pause', 'Keep paused').haltAll, true);
  assert.equal(normalizeStoredControl({ unexpected: true }).haltAll, true);
});

test('missing, inconsistent, stale, or future status cannot authorize submission', () => {
  assert.equal(parseAutomationStatus({ ...status(), haltAll: true }), null);
  assert.equal(parseAutomationStatus({ ...status(), exitCadenceMinutes: NaN }), null);
  assert.equal(automationPermission(null, 'entry'), false);
  assert.equal(automationLabel(null), 'Status unknown');
  for (const observedAt of ['invalid', '2026-09-03T13:58:59Z', '2026-09-03T14:00:01Z']) {
    assert.equal(automationPermission({ ...status(), observedAt }, 'entry', Date.parse(now)), false);
    assert.equal(automationLabel({ ...status(), observedAt }, Date.parse(now)), 'Status unknown');
  }
});

test('the submission-time status read blocks entries but allows exits during an entry pause', async () => {
  const paused = status(changeAutomationControl(active, 'pause', 'Review'));
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', VOLGUARD_TELEMETRY_URL: 'https://volguard.example/api/telemetry' };
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://volguard.example/api/automation');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ ...paused, observedAt: new Date().toISOString() });
  };
  await requireAutomationPermission('exit', env, fakeFetch);
  await assert.rejects(requireAutomationPermission('entry', env, fakeFetch), /Entry submission blocked/);
  await assert.rejects(requireAutomationPermission('entry', env, async () => new Response(null, { status: 503 })), /unavailable/);
});
