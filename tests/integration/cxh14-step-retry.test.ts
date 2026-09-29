/**
 * CXH-14 wiring (retest of cceeb5d): a temporarily unavailable token endpoint (429 / 5xx on refresh) keeps the
 * credentials AND the workflow step honours it — the step retries within its own attempt budget after the provider's
 * Retry-After (bounded), and a final failure keeps the retry metadata (retryable + retryAfterMs) on the step error.
 * Real workflow runs through the worker against the fake provider's OAuth token endpoint.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { completeOAuth, startOAuth } from "@/server/connections";
import { createFlow, saveFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { seedPlatformCredential } from "../fixtures/platform-seed";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";
import { sessionFor, type TestSession } from "./platform-helpers";

let fake: Fake;
const prev = { ...process.env };
beforeAll(async () => {
  fake = await startFake();
  await fake.reset();
  await seedPlatformCredential("integration.google", { publicId: "fake-client", secret: "fake-secret" });
});
beforeEach(async () => {
  await fake.reset();
});
afterAll(async () => {
  Object.assign(process.env, prev);
  await fake.close();
  await closeDb();
});

async function authorize(url: string) {
  const res = await fetch(url, { redirect: "manual" });
  const loc = new URL(res.headers.get("location")!);
  return { code: loc.searchParams.get("code")!, state: loc.searchParams.get("state")! };
}
async function connect(user: { id: string }, session: TestSession, workspaceId: string) {
  const { url } = await startOAuth(db, { userId: user.id, sessionToken: session.token, workspaceId, providerId: "google_sheets" });
  const a = await authorize(url);
  return completeOAuth(db, { state: a.state, code: a.code, userId: user.id, sessionToken: session.token });
}
const node = (id: string, type: FlowNode["type"], config: Record<string, unknown>, x = 0): FlowNode => ({ id, type, position: { x, y: 0 }, data: { label: id, config: config as never } });

async function setup(prefix: string, maxAttempts: number) {
  const owner = await makeUser(`${prefix}-owner`);
  const ws = await createWorkspace(owner, unique(prefix));
  const r = await connect(owner, await sessionFor(owner), ws.id);
  const graph: FlowGraph = {
    nodes: [
      node("t", "trigger.manual", { samplePayload: "{}" }),
      node("s", "integration.action", { actionId: "google_sheets.read_range", connectionId: r.connectionId, inputMapping: '{ "spreadsheetId": "sheet-1", "range": "A1:B2" }', requireApproval: false, retry: { maxAttempts } }, 200),
    ],
    edges: [{ id: "e1", source: "t", target: "s" }],
  };
  const flow = await createFlow(owner, ws.id, { name: unique("Sheets") });
  await saveFlow(owner, flow.id, { baseRevision: 1, graph });
  // The access token has expired: the step must refresh it first.
  await db.update(schema.connection).set({ accessExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.connection.id, r.connectionId));
  return { owner, flow, connectionId: r.connectionId };
}
const tokenCalls = async () => (await fake.requests("google_sheets")).filter((q) => q.method === "POST" && /\/oauth\/token$/.test(q.path)).length;
const stepOf = async (runId: string) => (await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, "s"))))[0]!;
const retries = (runId: string) => db.select().from(schema.runEvent).where(and(eq(schema.runEvent.runId, runId), eq(schema.runEvent.type, "step_retry")));

describe("CXH-14: a temporarily unavailable token endpoint is retried by the step (Retry-After honoured)", () => {
  it("429 with Retry-After: 1 → the step waits ~1 s, refreshes, and succeeds; the connection stays active", async () => {
    const { owner, flow, connectionId } = await setup("cx14ok", 3);
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "429", retryAfterSec: 1, times: 1 });
    const before = await tokenCalls();
    const r = await enqueueRun(owner, flow.id);
    const t0 = Date.now();
    await claimAndProcess(r.id);
    const run = await freshRun(r.id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000); // the Retry-After was waited for
    expect((await tokenCalls()) - before).toBe(2);
    const ev = await retries(r.id);
    expect(ev.map((e) => e.data)).toEqual([expect.objectContaining({ attempt: 1, error: "CONNECTION_UNAVAILABLE", waitMs: 1000 })]);
    const [c] = await db.select().from(schema.connection).where(eq(schema.connection.id, connectionId));
    expect(c!.status).toBe("active");
  });

  it("still unavailable after the step's attempts → failed with the retry metadata kept (retryable, retryAfterMs)", async () => {
    const { owner, flow } = await setup("cx14fail", 2);
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "429", retryAfterSec: 1, times: 5 });
    const before = await tokenCalls();
    const r = await enqueueRun(owner, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).status).toBe("failed");
    expect((await stepOf(r.id)).error).toMatchObject({ code: "CONNECTION_UNAVAILABLE", retryable: true, retryAfterMs: 1000 });
    expect((await tokenCalls()) - before).toBe(2); // the step's attempt budget (maxAttempts 2), not more
    expect(await retries(r.id)).toHaveLength(1);
  });

  it("a Retry-After beyond the bound (120 s) is not waited for: the step fails at once, retryable, with the delay reported", async () => {
    const { owner, flow } = await setup("cx14long", 3);
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "429", retryAfterSec: 120, times: 1 });
    const r = await enqueueRun(owner, flow.id);
    const t0 = Date.now();
    await claimAndProcess(r.id);
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect((await stepOf(r.id)).error).toMatchObject({ code: "CONNECTION_UNAVAILABLE", retryable: true, retryAfterMs: 120_000 });
    expect(await retries(r.id)).toHaveLength(0);
  });
});
