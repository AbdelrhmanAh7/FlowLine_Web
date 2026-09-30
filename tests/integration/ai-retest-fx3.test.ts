/**
 * Regression tests for the Codex retest of f74a5a1 (artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST2-f74a5a1.md), third
 * fix round, each with a controlled PostgreSQL interleaving:
 * - CXH-12: omitted pricing is inherited from the row current AT UPDATE TIME, never from an earlier unlocked read.
 * - CXH-17: lease re-validation, abandonment settlement + placeholder, and late-success reconciliation are serialized
 *   on the usage_event row (and the owning run's lease row).
 * - CXH-20: concurrent shared-catalogue refreshes with opposite listing orders don't deadlock.
 */
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { catalogueTestHooks } from "@/ai/hub/catalogue";
import { createAiConnection, getAiConnection } from "@/ai/hub/connections";
import { discoveryTestHooks, storeCatalogue } from "@/ai/hub/discovery";
import { executeAi, recoveryTestHooks } from "@/ai/hub/execute";
import { resolveRoute } from "@/ai/hub/routing";
import type { DiscoveredModel, HubChatRequest } from "@/ai/hub/types";
import { db, pool, schema } from "@/db";
import type { AiRouteRef } from "@/db/schema";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import type { CurrentUser } from "@/server/access";
import { createFlow, saveFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { connectAi, fakeKey, MODEL_PROVIDER_ENV_KEYS, useAiDouble } from "./ai-helpers";
import { closeDb, makeUser, unique } from "./helpers";

let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prevEnv = { ...process.env };

beforeAll(async () => {
  ai = await startFakeAi(0);
  useAiDouble(ai.url);
});
afterAll(async () => {
  Object.assign(process.env, prevEnv);
  stopSandbox();
  await ai.close();
  await closeDb();
});
beforeEach(async () => {
  await fetch(`${ai.url}/__fake/reset`, { method: "POST" });
  for (const k of MODEL_PROVIDER_ENV_KEYS) delete process.env[k];
  discoveryTestHooks.afterFence = undefined;
  discoveryTestHooks.onRetry = undefined;
  catalogueTestHooks.beforeSharedWrites = undefined;
  catalogueTestHooks.afterSharedRow = undefined;
  recoveryTestHooks.afterLeaseRead = undefined;
  recoveryTestHooks.afterAbandonSettle = undefined;
});

/* ───────── helpers ───────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => Promise<boolean> | boolean, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
/**
 * A session of this test database is blocked by another session while running a statement on `table` — i.e. the
 * contention the test is about, not an unrelated lock (CXH-21: `pg_blocking_pids` must be non-empty AND the waiting
 * statement must touch the contested table).
 */
async function blockedOn(table: string) {
  const r = await pool.query(
    `select count(*)::int as n from pg_stat_activity a
      where a.datname = current_database() and a.pid <> pg_backend_pid() and cardinality(pg_blocking_pids(a.pid)) > 0
        and a.query ilike $1`,
    [`%${table}%`],
  );
  return (r.rows[0] as { n: number }).n > 0;
}
const post = (p: string, body: unknown) => fetch(`${ai.url}${p}`, { method: "POST", body: JSON.stringify(body) });
const oaFault = (f: Record<string, unknown>) => post("/__fake/openai/fault", { times: 1, ...f });
const ref = (c: { id: string }, modelId: string): AiRouteRef => ({ connectionId: c.id, modelId });
const PRICE = { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 1_000_000 };
const setPrices = (wsId: string, prices: Record<string, unknown>) => db.update(schema.workspace).set({ prices: prices as never }).where(eq(schema.workspace.id, wsId));
const wsRow = async (id: string) => (await db.select().from(schema.workspace).where(eq(schema.workspace.id, id)))[0]!;
const ledger = (requestId: string) =>
  db
    .select()
    .from(schema.usageEvent)
    .where(like(schema.usageEvent.idempotencyKey, `${requestId}:%`))
    .orderBy(schema.usageEvent.id);
const attemptsFor = (requestId: string) => db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.requestId, requestId)).orderBy(schema.aiAttempt.id);

async function tenant(name: string) {
  const owner = await makeUser(`${name}-own`);
  const ws = await createWorkspace(owner, unique(name));
  const { connection } = await connectAi(owner, ws.id);
  return { owner, ws, conn: connection };
}
const plain: HubChatRequest = { system: "Summarise.", messages: [{ role: "user", content: "<untrusted_content>\nPriority: high\n</untrusted_content>" }], maxTokens: 50 };
async function exec(wsId: string, actor: CurrentUser, route: AiRouteRef, extra: Partial<Parameters<typeof executeAi>[1]> = {}) {
  const w = await wsRow(wsId);
  return executeAi(db, {
    workspace: w,
    actorUserId: actor.id,
    route: await resolveRoute(db, w, { pin: route }),
    request: plain,
    purpose: "node",
    metering: "hub",
    requestId: `t:${randomUUID()}`,
    signal: AbortSignal.timeout(20_000),
    ...extra,
  });
}
const node = (id: string, type: FlowNode["type"], config: Record<string, unknown>, x = 0): FlowNode => ({ id, type, position: { x, y: 0 }, data: { label: id, config: config as never } });
const aiGraph = (): FlowGraph => ({
  nodes: [node("t", "trigger.manual", { samplePayload: '{"t":"Priority: high"}' }), node("g", "ai.generate", { instructions: "Summarise", source: "t", maxTokens: 100, model: "" }, 200), node("o", "output", { key: "r", expression: "" }, 400)],
  edges: [
    { id: "e1", source: "t", target: "g" },
    { id: "e2", source: "g", target: "o" },
  ],
});
/** A run held by `holder` (as a worker would hold it) — never processed by a worker in this file. */
async function leasedRun(owner: CurrentUser, wsId: string, holder: string) {
  const flow = await createFlow(owner, wsId, { name: unique("AI") });
  await saveFlow(owner, flow.id, { baseRevision: 1, graph: aiGraph() });
  const r = await enqueueRun(owner, flow.id);
  await db.update(schema.run).set({ status: "running", lockedBy: holder, heartbeatAt: new Date() }).where(eq(schema.run.id, r.id));
  return r.id;
}
async function orConn(n: string) {
  const owner = await makeUser(n);
  const ws = await createWorkspace(owner, unique(n));
  const c = await createAiConnection(db, owner.id, ws.id, { provider: "openrouter", label: "or", apiKey: fakeKey("openrouter") });
  return getAiConnection(db, ws.id, c.id);
}
const sharedRow = async (modelId: string) => (await db.select().from(schema.aiModel).where(and(eq(schema.aiModel.provider, "openrouter"), eq(schema.aiModel.modelId, modelId))))[0];
const priced = (id: string, micros: number): DiscoveredModel => ({ id, ownedBy: "acme", pricing: { inputPerMTokMicros: micros, outputPerMTokMicros: micros, currency: "USD" } });

/* ───────── CXH-12 ───────── */

describe("CXH-12: omitted pricing is inherited from the row current at update time", () => {
  it("A (newer, omits pricing) paused after starting; B (older, paid price) commits; A resumes → B's paid price survives", async () => {
    const [seed, a, b] = [await orConn("cx12s"), await orConn("cx12a"), await orConn("cx12b")];
    const model = `acme/inherit-${randomUUID().slice(0, 8)}`;
    const t0 = new Date(Date.now() - 30_000);
    const t1 = new Date(Date.now() - 20_000);
    const t2 = new Date(Date.now() - 10_000);
    // A false zero is currently stored (observed at T0).
    expect(await storeCatalogue(db, seed, [priced(model, 0)], t0)).toBe(true);
    expect((await sharedRow(model))?.pricing?.inputPerMTokMicros).toBe(0);

    let reached = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    catalogueTestHooks.beforeSharedWrites = async () => {
      catalogueTestHooks.beforeSharedWrites = undefined;
      reached = true;
      await gate;
    };
    // A: observation at T2 that supplies NO price object.
    const pa = storeCatalogue(db, a, [{ id: model, ownedBy: "acme" }], t2);
    await until(() => reached, "A to start its shared catalogue step");
    // B: older observation (T1) with a paid price, committed while A is paused.
    expect(await storeCatalogue(db, b, [priced(model, 2_000_000)], t1)).toBe(true);
    expect((await sharedRow(model))?.pricing?.inputPerMTokMicros).toBe(2_000_000);
    release();
    expect(await pa).toBe(true);
    const row = (await sharedRow(model))!;
    expect(row.pricing?.inputPerMTokMicros).toBe(2_000_000); // never the stale zero A may have seen earlier
    expect(row.pricing?.outputPerMTokMicros).toBe(2_000_000);
    expect(row.observedAt?.getTime()).toBe(t2.getTime()); // A's newer observation still advanced the row
    expect(row.freeTierNote).toBeNull();
  });

  it("an explicitly unusable price still clears the stored price; an omitted one keeps it", async () => {
    const c = await orConn("cx12i");
    const model = `acme/clear-${randomUUID().slice(0, 8)}`;
    expect(await storeCatalogue(db, c, [priced(model, 3_000_000)], new Date(Date.now() - 20_000))).toBe(true);
    expect(await storeCatalogue(db, c, [{ id: model, ownedBy: "acme" }], new Date(Date.now() - 10_000))).toBe(true);
    expect((await sharedRow(model))?.pricing?.inputPerMTokMicros).toBe(3_000_000);
    expect(await storeCatalogue(db, c, [{ id: model, ownedBy: "acme", pricingInvalid: true }], new Date())).toBe(true);
    const row = (await sharedRow(model))!;
    expect(row.pricing).toBeNull();
    expect(row.priceSource).toBeNull();
    expect(row.priceVerifiedAt).toBeNull();
  });
});

/* ───────── CXH-20 ───────── */

describe("CXH-20: concurrent shared-catalogue refreshes with opposite listing orders", () => {
  it("both refreshes succeed (no deadlock, no retry needed) when their listings order the shared models oppositely", async () => {
    const [a, b] = [await orConn("cx20a"), await orConn("cx20b")];
    const tag = randomUUID().slice(0, 8);
    const m1 = `acme/dl-${tag}-a`;
    const m2 = `acme/dl-${tag}-b`;
    const retries: string[] = [];
    discoveryTestHooks.onRetry = async (code) => void retries.push(code);
    // Each refresh pauses after its FIRST shared row write, while holding that row.
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    catalogueTestHooks.afterSharedRow = async (_modelId, index) => {
      if (index !== 0) return;
      arrivals++;
      await gate;
    };
    const observed = new Date();
    const pa = storeCatalogue(db, a, [priced(m1, 1_000_000), priced(m2, 1_000_000)], observed);
    await until(() => arrivals === 1, "refresh A to hold its first shared row");
    const pb = storeCatalogue(db, b, [priced(m2, 2_000_000), priced(m1, 2_000_000)], observed);
    // B either holds its own first row (inconsistent order: a lock cycle follows) or waits for A's row (ordered).
    // CXH-21: this rendezvous MUST happen — a timeout fails the test instead of letting A finish alone (false green).
    try {
      await until(async () => arrivals === 2 || (await blockedOn("ai_model")), "refresh B to reach the contested shared row (holding its own row, or blocked on A's)", 8_000);
    } finally {
      release();
    }
    const results = await Promise.allSettled([pa, pb]);
    catalogueTestHooks.afterSharedRow = undefined;
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : `rejected: SQLSTATE ${(r.reason as { cause?: { code?: string } }).cause?.code ?? "?"}`))).toEqual([true, true]);
    expect(retries).toEqual([]);
    expect((await sharedRow(m1))?.pricing?.inputPerMTokMicros).toBeGreaterThan(0);
    expect((await sharedRow(m2))?.pricing?.inputPerMTokMicros).toBeGreaterThan(0);
  });

  it("a serialization / deadlock failure of the catalogue transaction is retried (bounded) instead of failing the refresh", async () => {
    const c = await orConn("cx20r");
    const model = `acme/retry-${randomUUID().slice(0, 8)}`;
    const retries: string[] = [];
    discoveryTestHooks.onRetry = async (code) => void retries.push(code);
    let thrown = 0;
    catalogueTestHooks.afterSharedRow = async () => {
      if (thrown++ < 2) throw Object.assign(new Error("deadlock detected"), { code: thrown === 1 ? "40P01" : "40001" });
    };
    expect(await storeCatalogue(db, c, [priced(model, 4_000_000)], new Date())).toBe(true);
    expect(retries).toEqual(["40P01", "40001"]);
    expect((await sharedRow(model))?.pricing?.inputPerMTokMicros).toBe(4_000_000);

    // Bounded: a failure that keeps recurring is surfaced, not retried forever.
    retries.length = 0;
    catalogueTestHooks.afterSharedRow = async () => {
      throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
    };
    await expect(storeCatalogue(db, c, [priced(`${model}-x`, 1)], new Date())).rejects.toThrow("deadlock detected");
    expect(retries).toHaveLength(2); // 3 attempts in total
    expect(await sharedRow(`${model}-x`)).toBeUndefined();
  });
});

/* ───────── CXH-17 ───────── */

describe("CXH-17: lease validation, abandonment and late-success reconciliation are serialized", () => {
  it("a heartbeat renewed right after recovery read a stale lease keeps the live reservation (it is not abandoned)", async () => {
    const { owner, ws, conn } = await tenant("HbRenew");
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": PRICE });
    const runId = await leasedRun(owner, ws.id, "w-live");
    const requestId = `t:${randomUUID()}`;
    await oaFault({ mode: "slow", path: "chat", delayMs: 2_500 });
    const a = exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    await until(async () => (await ledger(requestId)).length === 1, "attempt A to reserve");
    // The lease looks expired to recovery (heartbeat 2 min old)…
    await db.update(schema.run).set({ heartbeatAt: new Date(Date.now() - 120_000) }).where(eq(schema.run.id, runId));
    let renewed = false;
    recoveryTestHooks.afterLeaseRead = async () => {
      recoveryTestHooks.afterLeaseRead = undefined;
      // …but the owning worker renews its heartbeat right after that read.
      await db.update(schema.run).set({ heartbeatAt: new Date() }).where(and(eq(schema.run.id, runId), eq(schema.run.lockedBy, "w-live")));
      renewed = true;
    };
    const b = await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    const ra = await a;
    expect(renewed).toBe(true);
    expect([ra.usageKey, b.usageKey].sort()).toEqual([`${requestId}:1`, `${requestId}:2`]);
    const rows = await ledger(requestId);
    for (const u of rows) {
      expect(u.abandonedAt).toBeNull(); // the live reservation was never declared abandoned
      expect(u.status).toBe("settled");
      expect(Number(u.costMicros)).toBeLessThan(Number(u.estimatedMicros));
    }
    const att = await attemptsFor(requestId);
    expect(att.filter((x) => x.outcome === "interrupted")).toEqual([]);
    expect(att.map((x) => [x.attempt, x.outcome]).sort()).toEqual([
      [1, "success"],
      [2, "success"],
    ]);
  });

  it("a late success that arrives between the abandonment settlement and its placeholder still ends reconciled", async () => {
    const { owner, ws, conn } = await tenant("LateCross");
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": PRICE });
    const runId = await leasedRun(owner, ws.id, "w-old");
    const requestId = `t:${randomUUID()}`;
    await oaFault({ mode: "slow", path: "chat", delayMs: 2_000 });
    let aDone = false;
    const a = exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    void a.then(
      () => (aDone = true),
      () => (aDone = true),
    );
    await until(async () => (await ledger(requestId)).length === 1, "attempt A to reserve");
    await db.update(schema.run).set({ lockedBy: "w-new", heartbeatAt: new Date() }).where(eq(schema.run.id, runId));
    let paused = false;
    recoveryTestHooks.afterAbandonSettle = async () => {
      recoveryTestHooks.afterAbandonSettle = undefined;
      paused = true;
      // Let A's late success run now: it either completes (unserialized) or waits on the usage_event row (serialized).
      // CXH-21: required rendezvous — a timeout fails the test (it would otherwise pass without the race occurring).
      await until(async () => aDone || (await blockedOn("usage_event")), "attempt A's late success to complete or block on the usage_event row", 10_000);
    };
    await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    const ra = await a;
    expect(paused).toBe(true);
    const rows = await ledger(requestId);
    expect(rows[0]!.abandonedAt).not.toBeNull();
    expect(Number(rows[0]!.costMicros)).toBe(ra.costMicros); // reconciled to the real cost
    expect(Number(rows[0]!.costMicros)).toBeLessThan(Number(rows[0]!.estimatedMicros));
    const first = (await attemptsFor(requestId)).filter((x) => x.attempt === 1);
    expect(first.filter((x) => x.outcome === "success")).toHaveLength(1);
    const placeholders = first.filter((x) => x.outcome === "interrupted");
    expect(placeholders).toHaveLength(1);
    // Never left as an unreconciled possible charge after the success was recorded.
    expect(placeholders[0]).toMatchObject({ errorCode: "AI_ATTEMPT_RECONCILED", possibleCharge: false });
  });

  it("an abandonment that comes after the attempt already settled successfully is a no-op", async () => {
    const { owner, ws, conn } = await tenant("AbandonAfter");
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": PRICE });
    const runId = await leasedRun(owner, ws.id, "w-old");
    const requestId = `t:${randomUUID()}`;
    await oaFault({ mode: "slow", path: "chat", delayMs: 1_500 });
    const a = exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    await until(async () => (await ledger(requestId)).length === 1, "attempt A to reserve");
    await db.update(schema.run).set({ lockedBy: "w-new", heartbeatAt: new Date() }).where(eq(schema.run.id, runId));
    let aDone = false;
    void a.then(() => (aDone = true));
    // Recovery read the lease as lost, then A's success settles before recovery takes the row.
    recoveryTestHooks.afterLeaseRead = async () => {
      recoveryTestHooks.afterLeaseRead = undefined;
      await until(() => aDone, "A to settle first");
    };
    await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    const ra = await a;
    const rows = await ledger(requestId);
    expect(rows[0]!.abandonedAt).toBeNull();
    expect(Number(rows[0]!.costMicros)).toBe(ra.costMicros);
    const att = await attemptsFor(requestId);
    expect(att.filter((x) => x.attempt === 1).map((x) => x.outcome)).toEqual(["success"]);
  });
});
