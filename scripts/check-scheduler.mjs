import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const build = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run',
  '--config', 'workers/github-scheduler/wrangler.jsonc',
  '--outdir', '.wrangler/scheduler-check',
], {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_LOG: 'none', WRANGLER_LOG_PATH: path.resolve('.wrangler/wrangler.log') },
});
if (build.error) throw build.error;
assert.equal(build.status, 0, 'The scheduler must compile before runtime checks.');

// Exercise the runtime installed with the locked Wrangler toolchain, not a broker.
const requireToolchain = createRequire(import.meta.resolve('wrangler'));
const { Miniflare, Response } = requireToolchain('miniflare');
const runtime = new Miniflare({
  modules: true,
  scriptPath: 'workers/github-scheduler/.wrangler/scheduler-check/index.js',
  // The locked local workerd supports this date; Wrangler separately validates production's newer date.
  compatibilityDate: '2026-05-22',
  compatibilityFlags: ['nodejs_compat'],
  durableObjects: { AUTOMATION_CONTROL: { className: 'AutomationControl', useSQLite: true } },
  bindings: { CONTROL_TOKEN: 'local-test-only', DASHBOARD_ORIGIN: 'https://volguard.test' },
  // No network request may escape this test runtime.
  outboundService: () => new Response('Network disabled in integration test', { status: 503 }),
});

async function control(action, reason = 'Integration test') {
  return runtime.dispatchFetch('https://volguard.test/control', {
    method: 'POST', headers: { Authorization: 'Bearer local-test-only', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason, actor: 'local-test', runId: '123' }),
  });
}

try {
  const initial = await runtime.dispatchFetch('https://volguard.test/status');
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).controlMode, 'active');
  const unauthorized = await runtime.dispatchFetch('https://volguard.test/control', {
    method: 'POST', body: JSON.stringify({ action: 'halt_all', reason: 'Unauthorized' }),
  });
  assert.equal(unauthorized.status, 401);
  const oversized = await runtime.dispatchFetch('https://volguard.test/control', {
    method: 'POST', headers: { Authorization: 'Bearer local-test-only', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pause', reason: 'x'.repeat(5_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await control('pause', '')).status, 422);
  assert.equal((await control('invalid')).status, 422);
  const paused = await (await control('pause')).json();
  assert.equal(paused.controlMode, 'entries_paused');
  assert.equal(paused.haltAll, false);
  assert.equal(paused.entriesPaused, true);
  assert.equal(paused.updatedBy, 'workflow-reported:local-test');
  assert.equal((await (await runtime.dispatchFetch('https://volguard.test/status')).json()).controlMode, 'entries_paused');
  assert.equal((await (await control('halt_all')).json()).haltAll, true);
  assert.equal((await (await control('pause')).json()).haltAll, true);
  assert.equal((await (await control('resume')).json()).controlMode, 'active');
  const cors = await runtime.dispatchFetch('https://volguard.test/status', { headers: { Origin: 'https://volguard.test' } });
  assert.equal(cors.headers.get('Access-Control-Allow-Origin'), 'https://volguard.test');
  const foreign = await runtime.dispatchFetch('https://volguard.test/status', { headers: { Origin: 'https://other.test' } });
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  console.log('Scheduler runtime checks passed: authentication, validation, durable state, pause/halt/resume, CORS. No broker or GitHub calls.');
} finally {
  await runtime.dispose();
}
