import { DurableObject } from "cloudflare:workers";
import {
  corsHeaders,
  dispatchWorkflow,
  isRegularMarketDispatchWindow,
  secureEqual,
  shouldRunEntry,
  shouldRunReplay,
} from "./core.mjs";

const CONTROL_NAME = "paper-trading";

export class AutomationControl extends DurableObject {
  async getStatus() {
    return (await this.ctx.storage.get("status")) ?? {
      paused: false,
      reason: "Automation is scheduled.",
      updatedAt: null,
      updatedBy: "system-default",
    };
  }

  async setPaused(paused, reason, updatedBy) {
    const status = {
      paused: Boolean(paused),
      reason: String(reason || (paused ? "Emergency pause requested." : "Automation resumed.")),
      updatedAt: new Date().toISOString(),
      updatedBy: String(updatedBy || "authenticated-operator"),
    };
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
    if (automation.paused) {
      console.log(JSON.stringify({
        event: "github_workflow_dispatch_skipped",
        reason: "automation_paused",
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        automation,
      }));
      return;
    }
    const runEntry = shouldRunEntry(controller.scheduledTime);
    const runReplay = shouldRunReplay(controller.scheduledTime);
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
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON." }, { status: 400, headers: cors });
    }
    if (body?.action !== "pause" && body?.action !== "resume") {
      return json({ error: "Action must be pause or resume." }, { status: 422, headers: cors });
    }
    const status = await control(env).setPaused(
      body.action === "pause",
      body.reason,
      "github-actions-operator",
    );
    console.log(JSON.stringify({ event: "automation_control_changed", ...status }));
    return json(status, { headers: cors });
  },
};

export default worker;
