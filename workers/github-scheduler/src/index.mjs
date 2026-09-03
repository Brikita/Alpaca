import { DurableObject } from "cloudflare:workers";
import {
  corsHeaders,
  dispatchWorkflow,
  dispatchPlan,
  isRegularMarketDispatchWindow,
  secureEqual,
} from "./core.mjs";
import { changeAutomationControl, normalizeStoredControl } from "./control.mjs";

const CONTROL_NAME = "paper-trading";

export class AutomationControl extends DurableObject {
  async getStatus() {
    return normalizeStoredControl(await this.ctx.storage.get("status"));
  }

  async setControl(action, reason, updatedBy, runId) {
    const status = changeAutomationControl(await this.getStatus(), action, reason, updatedBy, runId);
    await this.ctx.storage.put("status", status);
    return status;
  }
}

function control(env) {
  return env.AUTOMATION_CONTROL.getByName(CONTROL_NAME);
}

function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

async function readBoundedJson(request, maxBytes = 4096) {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(length) && length > maxBytes) throw new RangeError('Payload too large.');
  if (!request.body) throw new SyntaxError('Missing body.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RangeError('Payload too large.');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const worker = {
  async scheduled(controller, env) {
    if (!isRegularMarketDispatchWindow(controller.scheduledTime)) {
      console.log(JSON.stringify({
        event: "github_workflow_dispatch_skipped",
        reason: "outside_regular_market_window",
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        dispatchWindow: "09:25-16:00 America/New_York weekdays",
      }));
      return;
    }
    const automation = await control(env).getStatus();
    const plan = dispatchPlan(controller.scheduledTime, automation);
    if (!plan.dispatch) {
      console.log(JSON.stringify({
        event: "github_workflow_dispatch_skipped",
        reason: plan.reason,
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        automation,
      }));
      return;
    }
    const { runEntry, runReplay } = plan;
    const result = await dispatchWorkflow(env, {
      run_entry: String(runEntry),
      run_replay: String(runReplay),
    });
    console.log(JSON.stringify({
      event: "github_workflow_dispatched",
      scheduledAt: new Date(controller.scheduledTime).toISOString(),
      workflow: env.GITHUB_WORKFLOW,
      ref: env.GITHUB_REF,
      runEntry,
      runReplay,
      status: result.status,
    }));
  },

  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin, env.DASHBOARD_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/status" && request.method === "GET") {
      const status = await control(env).getStatus();
      return json({
        ...status,
        mode: "paper",
        observedAt: new Date().toISOString(),
        exitCadenceMinutes: 5,
        entryCadenceMinutes: 10,
        dispatchWindow: "09:25-16:00 America/New_York weekdays",
        dispatchEligibleNow: isRegularMarketDispatchWindow(Date.now()),
      }, { headers: cors });
    }
    if (url.pathname !== "/control" || request.method !== "POST") {
      return json({ error: "Not found." }, { status: 404, headers: cors });
    }
    if (!env.CONTROL_TOKEN) {
      return json({ error: "Control is not configured." }, { status: 503, headers: cors });
    }
    const supplied = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!supplied || !(await secureEqual(supplied, env.CONTROL_TOKEN))) {
      return json({ error: "Unauthorized." }, { status: 401, headers: cors });
    }

    let body;
    try {
      body = await readBoundedJson(request);
    } catch (error) {
      if (error instanceof RangeError) return json({ error: "Payload too large." }, { status: 413, headers: cors });
      return json({ error: "Invalid JSON." }, { status: 400, headers: cors });
    }
    if (!["pause", "resume", "halt_all"].includes(body?.action)
      || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 240
      || (body.actor !== undefined && (typeof body.actor !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.actor)))
      || (body.runId !== undefined && (typeof body.runId !== "string" || !/^\d{1,30}$/.test(body.runId)))) {
      return json({ error: "Choose pause, resume, or halt_all and provide a reason (1–240 characters)." }, { status: 422, headers: cors });
    }
    const status = await control(env).setControl(
      body.action,
      body.reason.trim(),
      body.actor ? `workflow-reported:${body.actor}` : "authenticated-operator",
      body.runId ?? null,
    );
    console.log(JSON.stringify({ event: "automation_control_changed", ...status }));
    return json(status, { headers: cors });
  },
};

export default worker;
