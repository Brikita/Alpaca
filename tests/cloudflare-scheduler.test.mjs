import assert from "node:assert/strict";
import test from "node:test";

import {
  corsHeaders,
  dispatchWorkflow,
  dispatchPlan,
  isRegularMarketDispatchWindow,
  newYorkClockParts,
  shouldRunReplay,
  shouldRunEntry,
} from "../workers/github-scheduler/src/core.mjs";
import { changeAutomationControl, normalizeStoredControl } from "../workers/github-scheduler/src/control.mjs";

const env = {
  GITHUB_OWNER: "Brikita",
  GITHUB_REPO: "Alpaca",
  GITHUB_WORKFLOW: "monitor-paper-position.yml",
  GITHUB_REF: "master",
  GITHUB_TOKEN: "test-token",
};

test("dispatches only the audited workflow on master", async () => {
  let captured;
  const result = await dispatchWorkflow(env, { run_entry: "true" }, async (url, init) => {
    captured = { url, init };
    return new Response(null, { status: 204 });
  });

  assert.equal(result.status, 204);
  assert.equal(
    captured.url,
    "https://api.github.com/repos/Brikita/Alpaca/actions/workflows/monitor-paper-position.yml/dispatches",
  );
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(captured.init.body), {
    ref: "master",
    inputs: { run_entry: "true" },
  });
});

test("selects every other five-minute trigger for the entry cycle", () => {
  assert.equal(shouldRunEntry(Date.parse("2026-09-02T13:02:00Z")), true);
  assert.equal(shouldRunEntry(Date.parse("2026-09-02T13:07:00Z")), false);
  assert.equal(shouldRunEntry(Date.parse("2026-09-02T13:12:00Z")), true);
  assert.equal(shouldRunEntry(Date.parse("2026-09-02T13:17:00Z")), false);
});

test("entry pause keeps five-minute exit dispatches while an explicit full halt stops dispatch", () => {
  const now = Date.parse("2026-09-03T14:02:00Z");
  const active = normalizeStoredControl(undefined);
  assert.deepEqual(dispatchPlan(now, active), { dispatch: true, runEntry: true, runReplay: false });
  assert.deepEqual(dispatchPlan(now, changeAutomationControl(active, 'pause', 'Review')),
    { dispatch: true, runEntry: false, runReplay: false });
  assert.deepEqual(dispatchPlan(now, changeAutomationControl(active, 'halt_all', 'Emergency')),
    { dispatch: false, reason: 'all_automation_halted' });
  assert.equal(dispatchPlan(now, { paused: true }).dispatch, false);
});

test("dispatches only inside the weekday New York regular-session window", () => {
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-09-02T13:27:00Z")), true);
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-09-02T19:57:00Z")), true);
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-09-02T13:22:00Z")), false);
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-09-02T20:02:00Z")), false);
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-09-05T15:02:00Z")), false);
});

test("uses America/New_York so winter dispatches shift with daylight saving time", () => {
  assert.deepEqual(newYorkClockParts(Date.parse("2026-01-05T14:32:00Z")), {
    weekday: "Mon", hour: "09", minute: "32",
  });
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-01-05T14:32:00Z")), true);
  assert.equal(isRegularMarketDispatchWindow(Date.parse("2026-01-05T21:02:00Z")), false);
});

test("selects only the first weekday cycle for the daily replay", () => {
  assert.equal(shouldRunReplay(Date.parse("2026-09-02T13:27:00Z")), true);
  assert.equal(shouldRunReplay(Date.parse("2026-09-02T13:32:00Z")), false);
  assert.equal(shouldRunReplay(Date.parse("2026-01-05T14:27:00Z")), true);
});

test("allows CORS only for the configured dashboard origin", () => {
  assert.equal(corsHeaders("https://volguard.example", "https://volguard.example")["Access-Control-Allow-Origin"], "https://volguard.example");
  assert.equal(corsHeaders("https://attacker.example", "https://volguard.example")["Access-Control-Allow-Origin"], undefined);
});

test("fails closed without a GitHub secret", async () => {
  await assert.rejects(
    dispatchWorkflow({ ...env, GITHUB_TOKEN: "" }),
    /GITHUB_TOKEN is not configured/,
  );
});

test("fails when GitHub does not accept the dispatch", async () => {
  await assert.rejects(
    dispatchWorkflow(env, {}, async () => new Response(null, { status: 403 })),
    /status 403/,
  );
});
