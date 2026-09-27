import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { POST as webhookPOST } from "@/app/api/hooks/[token]/route";
import type { FlowGraph } from "@/engine/types";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow, signWebhook } from "@/server/publish";
import { createWorkspace } from "@/server/workspaces";
import { schedulerTick } from "../../worker/scheduler";
import { claimNextRun, processRun, recoverStaleRuns } from "../../worker/runner";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

afterAll(closeDb);

const webhookGraph = (): FlowGraph => ({
  nodes: [
    { id: "t", type: "trigger.webhook", position: { x: 0, y: 0 }, data: { label: "Hook", config: { samplePayload: "{}" } } },
    { id: "x", type: "transform.json", position: { x: 200, y: 0 }, data: { label: "Shape", config: { expression: '{ "name": body.lead.name, "event": event_id }' } } },
    { id: "o", type: "output", position: { x: 400, y: 0 }, data: { label: "Out", config: { key: "lead", expression: "" } } },
  ],
  edges: [
    { id: "e1", source: "t", target: "x" },
    { id: "e2", source: "x", target: "o" },
  ],
});

async function publishedWebhookFlow() {
  const user = await makeUser("hook");
  const ws = await createWorkspace(user, unique("Hooks"));
  const flow = await createFlow(user, ws.id, { name: unique("Webhook flow") });
  await saveFlow(user, flow.id, { baseRevision: 1, graph: webhookGraph() });
  const pub = await publishFlow(user, flow.id);
  const token = pub.webhook!.url.split("/").pop()!;
  return { user, ws, flow, secret: pub.webhook!.secret!, token };
}

function deliver(token: string, secret: string, body: string, eventId: string | null, opts: { t?: number; sig?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-flowline-signature": opts.sig ?? signWebhook(secret, body, opts.t) };
  if (eventId) headers["x-flowline-event-id"] = eventId;
  return webhookPOST(new Request(`http://localhost/api/hooks/${token}`, { method: "POST", headers, body }), { params: Promise.resolve({ token }) });
}

describe("signed webhook trigger", () => {
  it("accepts a signed event, runs the published version, and dedupes by event id", async () => {
    const { flow, secret, token } = await publishedWebhookFlow();
    const body = JSON.stringify({ lead: { name: "Ada" } });
    const r1 = await deliver(token, secret, body, "evt-1");
    expect(r1.status).toBe(202);
    const j1 = await r1.json();
    const run = await freshRun(j1.runId);
    expect(run.triggerKind).toBe("webhook");
    expect(run.triggerRef).toBe("evt-1");
    const [pubFlow] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    expect(run.flowVersionId).toBe(pubFlow!.publishedVersionId);

    const r2 = await deliver(token, secret, body, "evt-1");
    expect(r2.status).toBe(200);
    expect((await r2.json()).runId).toBe(j1.runId);

    const r3 = await deliver(token, secret, JSON.stringify({ lead: { name: "Mallory" } }), "evt-1");
    expect(r3.status).toBe(409);

    const runs = await db.select().from(schema.run).where(eq(schema.run.flowId, flow.id));
    expect(runs).toHaveLength(1);
    await claimAndProcess(j1.runId);
    expect((await freshRun(j1.runId)).output).toEqual({ lead: { name: "Ada", event: "evt-1" } });
  });

  it("rejects bad signatures, stale timestamps and missing event ids", async () => {
    const { secret, token } = await publishedWebhookFlow();
    const body = "{}";
    expect((await deliver(token, secret, body, "e", { sig: "t=1,v1=deadbeef" })).status).toBe(401);
    expect((await deliver(token, "whsec_wrong", body, "e")).status).toBe(401);
    expect((await deliver(token, secret, body, "e", { t: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await deliver(token, secret, body, null)).status).toBe(400);
    expect((await deliver("no-such-token", secret, body, "e")).status).toBe(404);
  });

  it("concurrent duplicate deliveries create exactly one run; distinct events keep receipt order", async () => {
    const { flow, secret, token } = await publishedWebhookFlow();
    const body = JSON.stringify({ lead: { name: "Dup" } });
    const results = await Promise.all(Array.from({ length: 6 }, () => deliver(token, secret, body, "evt-race")));
    const ids = new Set((await Promise.all(results.map((r) => r.json()))).map((j) => j.runId));
    expect(ids.size).toBe(1);
    for (const n of ["a", "b", "c"]) expect((await deliver(token, secret, JSON.stringify({ lead: { name: n } }), `evt-${n}`)).status).toBe(202);
    const runs = await db.select().from(schema.run).where(eq(schema.run.flowId, flow.id)).orderBy(schema.run.number);
    expect(runs.map((r) => r.triggerRef)).toEqual(["evt-race", "evt-a", "evt-b", "evt-c"]);
  });

  it("paused flow: event is recorded but not run; unaffected flows continue", async () => {
    const paused = await publishedWebhookFlow();
    const healthy = await publishedWebhookFlow();
    await db.update(schema.flow).set({ pausedReason: "connection:x:expired" }).where(eq(schema.flow.id, paused.flow.id));
    const r = await deliver(paused.token, paused.secret, "{}", "evt-p");
    expect(r.status).toBe(202);
    expect((await r.json()).paused).toBe(true);
    expect(await db.select().from(schema.run).where(eq(schema.run.flowId, paused.flow.id))).toHaveLength(0);
    const ok = await deliver(healthy.token, healthy.secret, JSON.stringify({ lead: { name: "ok" } }), "evt-h");
    expect(ok.status).toBe(202);
  });

  it("an accepted event survives a worker crash after acceptance", async () => {
    const { secret, token } = await publishedWebhookFlow();
    const r = await deliver(token, secret, JSON.stringify({ lead: { name: "Crash" } }), "evt-crash");
    const { runId } = await r.json();
    // Worker A claims then dies (heartbeat goes stale).
    let claimed: string | null = null;
    for (let i = 0; i < 30 && claimed !== runId; i++) {
      claimed = await claimNextRun(db, "dead-worker");
      if (claimed && claimed !== runId) await processRun(db, claimed, "dead-worker");
    }
    await db.update(schema.run).set({ heartbeatAt: new Date(Date.now() - 120_000) }).where(eq(schema.run.id, runId));
    await recoverStaleRuns(db);
    await claimAndProcess(runId);
    const done = await freshRun(runId);
    expect(done.status).toBe("succeeded");
    const [ev] = await db.select().from(schema.webhookEvent).where(eq(schema.webhookEvent.runId, runId));
    expect(ev!.eventId).toBe("evt-crash");
  });
});

const scheduleGraph = (policy: "skip" | "run_once" | "run_all"): FlowGraph => ({
  nodes: [
    { id: "t", type: "trigger.schedule", position: { x: 0, y: 0 }, data: { label: "Every 15m", config: { cron: "*/15 * * * *", timezone: "UTC", missedPolicy: policy } } },
    { id: "o", type: "output", position: { x: 200, y: 0 }, data: { label: "Out", config: { key: "fired", expression: "scheduled_for" } } },
  ],
  edges: [{ id: "e", source: "t", target: "o" }],
});

async function publishedSchedule(policy: "skip" | "run_once" | "run_all") {
  const user = await makeUser("sched");
  const ws = await createWorkspace(user, unique("Sched"));
  const flow = await createFlow(user, ws.id, { name: unique("Scheduled") });
  await saveFlow(user, flow.id, { baseRevision: 1, graph: scheduleGraph(policy) });
  await publishFlow(user, flow.id);
  const [sc] = await db.select().from(schema.schedule).where(eq(schema.schedule.flowId, flow.id));
  return { flow, schedule: sc! };
}

async function runsOf(flowId: string) {
  return db.select().from(schema.run).where(eq(schema.run.flowId, flowId)).orderBy(schema.run.number);
}

describe("schedule trigger & missed-run policy", () => {
  // "now" is 30s after a quarter hour; the worker was down for 2 hours.
  const base = new Date(Date.UTC(2026, 8, 27, 12, 0, 30));
  const downSince = new Date(base.getTime() - 2 * 3600_000);

  async function arrange(policy: "skip" | "run_once" | "run_all") {
    const s = await publishedSchedule(policy);
    await db.update(schema.schedule).set({ lastFireAt: downSince, nextFireAt: new Date(downSince.getTime() + 15 * 60_000) }).where(eq(schema.schedule.id, s.schedule.id));
    return s;
  }

  it("skip: only the on-time fire runs; missed fires are recorded as skipped", async () => {
    const { flow, schedule } = await arrange("skip");
    await schedulerTick(db, base);
    const runs = await runsOf(flow.id);
    expect(runs.map((r) => r.triggerRef)).toEqual(["2026-09-27T12:00:00.000Z"]);
    const fires = await db.select().from(schema.scheduleFire).where(eq(schema.scheduleFire.scheduleId, schedule.id));
    expect(fires.filter((f) => f.status === "skipped_missed")).toHaveLength(7);
  });

  it("run_all: every missed fire runs (bounded), in order", async () => {
    const { flow } = await arrange("run_all");
    await schedulerTick(db, base);
    const runs = await runsOf(flow.id);
    expect(runs).toHaveLength(8);
    expect(runs[0]!.triggerRef).toBe("2026-09-27T10:15:00.000Z");
  });

  it("run_once: a single catch-up when the on-time fire is also missed", async () => {
    const { flow } = await arrange("run_once");
    await schedulerTick(db, new Date(base.getTime() + 5 * 60_000)); // 12:05:30 — 12:00 is now "missed" too
    const runs = await runsOf(flow.id);
    expect(runs.map((r) => r.triggerRef)).toEqual(["2026-09-27T12:00:00.000Z"]);
  });

  it("two schedulers ticking at once fire each time exactly once", async () => {
    const { flow } = await arrange("run_all");
    await Promise.all([schedulerTick(db, base), schedulerTick(db, base), schedulerTick(db, base)]);
    const runs = await runsOf(flow.id);
    expect(new Set(runs.map((r) => r.triggerRef)).size).toBe(runs.length);
    expect(runs).toHaveLength(8);
  });

  it("a paused flow records fires as skipped and does not catch up after resuming", async () => {
    const { flow, schedule } = await arrange("run_all");
    await db.update(schema.flow).set({ pausedReason: "connection:x:expired" }).where(eq(schema.flow.id, flow.id));
    await schedulerTick(db, base);
    expect(await runsOf(flow.id)).toHaveLength(0);
    await db.update(schema.flow).set({ pausedReason: null }).where(eq(schema.flow.id, flow.id));
    await schedulerTick(db, new Date(base.getTime() + 60_000));
    expect(await runsOf(flow.id)).toHaveLength(0);
    const fires = await db.select().from(schema.scheduleFire).where(and(eq(schema.scheduleFire.scheduleId, schedule.id), eq(schema.scheduleFire.status, "skipped_paused")));
    expect(fires).toHaveLength(8);
  });
});

beforeAll(async () => {
  // Drain runs left queued by other test files so claim-based tests are deterministic.
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
});
