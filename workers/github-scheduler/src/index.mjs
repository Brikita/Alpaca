const GITHUB_API_VERSION = "2022-11-28";

export function shouldRunEntry(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 10 === 2;
}

export async function dispatchWorkflow(env, inputs = {}, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not configured");
  }

  const path = [
    "repos",
    encodeURIComponent(env.GITHUB_OWNER),
    encodeURIComponent(env.GITHUB_REPO),
    "actions",
    "workflows",
    encodeURIComponent(env.GITHUB_WORKFLOW),
    "dispatches",
  ].join("/");

  const response = await fetchImpl(`https://api.github.com/${path}`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "volguard-github-scheduler",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    body: JSON.stringify({ ref: env.GITHUB_REF, inputs }),
  });

  if (response.status !== 204) {
    throw new Error(`GitHub workflow dispatch failed with status ${response.status}`);
  }

  return { status: response.status };
}

const worker = {
  async scheduled(controller, env) {
    const runEntry = shouldRunEntry(controller.scheduledTime);
    const result = await dispatchWorkflow(env, { run_entry: String(runEntry) });
    console.log(JSON.stringify({
      event: "github_workflow_dispatched",
      scheduledAt: new Date(controller.scheduledTime).toISOString(),
      workflow: env.GITHUB_WORKFLOW,
      ref: env.GITHUB_REF,
      runEntry,
      status: result.status,
    }));
  },
};

export default worker;
