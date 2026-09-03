const GITHUB_API_VERSION = "2022-11-28";
import { normalizeStoredControl } from "./control.mjs";
const NEW_YORK_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function newYorkClockParts(scheduledTime) {
  return Object.fromEntries(
    NEW_YORK_CLOCK.formatToParts(new Date(scheduledTime))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function isRegularMarketDispatchWindow(scheduledTime) {
  const parts = newYorkClockParts(scheduledTime);
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday)) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 25 && minutes < 16 * 60;
}

export function shouldRunEntry(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 10 === 2;
}

export function shouldRunReplay(scheduledTime) {
  const parts = newYorkClockParts(scheduledTime);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday)
    && minutes >= 9 * 60 + 25
    && minutes < 9 * 60 + 30;
}

export function dispatchPlan(scheduledTime, storedControl) {
  const control = normalizeStoredControl(storedControl);
  if (!isRegularMarketDispatchWindow(scheduledTime)) return { dispatch: false, reason: "outside_regular_market_window" };
  if (control.haltAll) return { dispatch: false, reason: "all_automation_halted" };
  return { dispatch: true, runEntry: !control.entriesPaused && shouldRunEntry(scheduledTime),
    runReplay: shouldRunReplay(scheduledTime) };
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
