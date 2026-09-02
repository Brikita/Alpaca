import assert from "node:assert/strict";
import test from "node:test";

import { dispatchWorkflow } from "../workers/github-scheduler/src/index.mjs";

const env = {
  GITHUB_OWNER: "Brikita",
  GITHUB_REPO: "Alpaca",
  GITHUB_WORKFLOW: "monitor-paper-position.yml",
  GITHUB_REF: "master",
  GITHUB_TOKEN: "test-token",
};

test("dispatches only the audited workflow on master", async () => {
  let captured;
  const result = await dispatchWorkflow(env, async (url, init) => {
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
  assert.deepEqual(JSON.parse(captured.init.body), { ref: "master" });
});

test("fails closed without a GitHub secret", async () => {
  await assert.rejects(
    dispatchWorkflow({ ...env, GITHUB_TOKEN: "" }),
    /GITHUB_TOKEN is not configured/,
  );
});

test("fails when GitHub does not accept the dispatch", async () => {
  await assert.rejects(
    dispatchWorkflow(env, async () => new Response(null, { status: 403 })),
    /status 403/,
  );
});
