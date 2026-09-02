const GITHUB_API_VERSION = "2022-11-28";

export function shouldRunEntry(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 10 === 2;
}

export function shouldRunReplay(scheduledTime) {
  const date = new Date(scheduledTime);
  return date.getUTCHours() === 13 && date.getUTCMinutes() === 2;
}

export async function secureEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
}

export async function dispatchWorkflow(env, inputs = {}, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured");

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
      "Content-Type": "application/json",
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

export function corsHeaders(origin, allowedOrigin) {
  return origin === allowedOrigin
    ? {
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Origin": allowedOrigin,
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}
