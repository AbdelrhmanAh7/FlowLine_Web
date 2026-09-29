/**
 * Regression tests for the Codex Wave C review (artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md), against PostgreSQL
 * and the protocol-accurate AI test double: CXH-03 (recovery / duplicate billing, incl. concurrent attempts on one
 * request), CXH-04 (agent spending limit across retries, fallback and unknown prices), CXH-07 (reservation counts the
 * whole protocol request), CXH-08 (unknown usage keeps the reservation), CXH-11 (public listings are not key checks),
 * CXH-12 (stale health / catalogue writes are fenced) and CXH-13 (FALLBACK handles a removed primary model).
 */
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAiConnection, disconnectAiConnection, getAiConnection, replaceAiKey, testAiConnection } from "@/ai/hub/connections";
import { refreshCatalogue } from "@/ai/hub/discovery";
import { executeAi } from "@/ai/hub/execute";
import { resolveRoute } from "@/ai/hub/routing";
import type { HubChatRequest } from "@/ai/hub/types";
import { db, schema } from "@/db";
import type { AiPolicy, AiRouteRef } from "@/db/schema";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import type { CurrentUser } from "@/server/access";
import { createAgent, startAgentRun } from "@/server/agents";
import { createFlow, saveFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { reserveUsage } from "@/server/usage";
import { createWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { claimNextAgentRun, processAgentRun } from "../../worker/agent-runner";
import { claimNextRun, processRun, recoverStaleRuns } from "../../worker/runner";
import { connectAi, fakeKey, MODEL_PROVIDER_ENV_KEYS, useAiDouble } from "./ai-helpers";
import { claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prevEnv = { ...process.env };

beforeAll(async () => {
  ai = await startFakeAi(0);
  useAiDouble(ai.url);
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
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
});

/* ───────── helpers ───────── */

const post = (path: string, body: unknown) => fetch(`${ai.url}${path}`, { method: "POST", body: JSON.stringify(body) });
const hubFault = (f: Record<string, unknown>) => post("/__fake/hub/fault", { times: 1, ...f });
const oaFault = (f: Record<string, unknown>) => post("/__fake/openai/fault", { times: 1, ...f });
const oaChats = async () => ((await (await fetch(`${ai.url}/__fake/openai/requests`)).json()) as { requests: { method: string; path: string }[] }).requests.filter((r) => r.method === "POST" && r.path.endsWith("/chat/completions"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const setPolicy = (wsId: string, p: AiPolicy) => db.update(schema.workspace).set({ aiPolicy: p }).where(eq(schema.workspace.id, wsId));
const wsRow = async (id: string) => (await db.select().from(schema.workspace).where(eq(schema.workspace.id, id)))[0]!;
const ref = (c: { id: string }, modelId: string): AiRouteRef => ({ connectionId: c.id, modelId });
const PRICE = { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 1_000_000 }; // 1 micro-unit per token
const priceModel = (wsId: string, model = "fake-gpt-mini") => db.update(schema.workspace).set({ prices: { [`ai:openai/${model}`]: PRICE } }).where(eq(schema.workspace.id, wsId));
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
/** A workspace on the test plan WITHOUT a usage cap (so only the agent's own limit applies). */
async function uncappedPlan(wsId: string) {
  await db.insert(schema.billingAccount).values({ workspaceId: wsId, provider: "stripe", customerId: `cus_${randomUUID()}`, planId: "test_pro", status: "active" });
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
const aiGraph = (cfg: Record<string, unknown> = {}): FlowGraph => ({
  nodes: [node("t", "trigger.manual", { samplePayload: '{"t":"Priority: high. Customer is angry"}' }), node("g", "ai.generate", { instructions: "Summarise", source: "t", maxTokens: 100, model: "", ...cfg }, 200), node("o", "output", { key: "r", expression: "" }, 400)],
  edges: [
    { id: "e1", source: "t", target: "g" },
    { id: "e2", source: "g", target: "o" },
  ],
});
async function aiFlow(user: CurrentUser, wsId: string, cfg: Record<string, unknown> = {}) {
  const flow = await createFlow(user, wsId, { name: unique("AI") });
  await saveFlow(user, flow.id, { baseRevision: 1, graph: aiGraph(cfg) });
  return flow;
}
const stepOf = async (runId: string, nodeId = "g") => (await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId))))[0]!;

async function runAgent(agentRunId: string) {
  for (let i = 0; i < 10; i++) {
    const w = unique("a");
    const id = await claimNextAgentRun(db, w);
    if (!id) break;
    await processAgentRun(db, id, w);
    if (id === agentRunId) break;
  }
  return (await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, agentRunId)))[0]!;
}
const agentLedger = (agentRunId: string) => db.select().from(schema.usageEvent).where(eq(schema.usageEvent.agentRunId, agentRunId));
const spentOf = (rows: { status: string; costMicros: number }[]) => rows.filter((r) => r.status !== "released").reduce((n, r) => n + Number(r.costMicros), 0);

/* ───────── CXH-03 ───────── */

describe("CXH-03: recovery never re-sends on an existing ledger key", () => {
  it("a worker that died after the charge settled: recovery allocates + reserves a NEW attempt, and a dead worker's open reservation is kept as a possible charge", async () => {
    const { owner, ws } = await tenant("Recover");
    await priceModel(ws.id);
    const flow = await aiFlow(owner, ws.id);
    const r = await enqueueRun(owner, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).status).toBe("succeeded");
    const [first] = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.runId, r.id));
    const requestId = first!.requestId;
    expect(await ledger(requestId)).toHaveLength(1);

    // The worker "died" after settling attempt 1 and after reserving attempt 2, before the step became terminal.
    await reserveUsage(db, { workspaceId: ws.id, runId: r.id, nodeId: "g", kind: "ai", idempotencyKey: `${requestId}:2`, estimatedMicros: 777, provider: "openai", model: "fake-gpt-mini" });
    // It reserved before its heartbeat stopped (recovery only happens after the heartbeat is stale).
    await db.update(schema.usageEvent).set({ createdAt: new Date(Date.now() - 10 * 60_000) }).where(eq(schema.usageEvent.idempotencyKey, `${requestId}:2`));
    await db.update(schema.run).set({ status: "running", lockedBy: "dead-worker", heartbeatAt: new Date(Date.now() - 3_600_000), finishedAt: null, output: null }).where(eq(schema.run.id, r.id));
    await db.update(schema.runStep).set({ status: "running", finishedAt: null }).where(and(eq(schema.runStep.runId, r.id), eq(schema.runStep.nodeId, "g")));
    await db.update(schema.runStep).set({ status: "pending", startedAt: null, finishedAt: null, output: null, dataEnc: null }).where(and(eq(schema.runStep.runId, r.id), eq(schema.runStep.nodeId, "o")));
    const before = (await oaChats()).length;

    expect(await recoverStaleRuns(db)).toBeGreaterThanOrEqual(1);
    await claimAndProcess(r.id);
    const resumed = await freshRun(r.id);
    const events = await db.select({ type: schema.runEvent.type, data: schema.runEvent.data }).from(schema.runEvent).where(eq(schema.runEvent.runId, r.id));
    expect(resumed.status, JSON.stringify({ error: resumed.error, lockedBy: resumed.lockedBy, events })).toBe("succeeded");

    expect((await oaChats()).length - before).toBe(1); // exactly one new provider request
    const rows = await ledger(requestId);
    // Every send has its own reserved-then-settled ledger event; nothing was sent on an existing key.
    expect(rows.map((u) => [u.idempotencyKey, u.status])).toEqual([
      [`${requestId}:1`, "settled"],
      [`${requestId}:2`, "settled"],
      [`${requestId}:3`, "settled"],
    ]);
    expect(Number(rows[1]!.costMicros)).toBe(777); // the dead worker's possible charge is kept at its reservation
    const att = await attemptsFor(requestId);
    expect(att.map((a) => [a.attempt, a.outcome, a.possibleCharge])).toEqual([
      [1, "success", false],
      [2, "interrupted", true],
      [3, "success", false],
    ]);
    expect((await stepOf(r.id)).meta).toMatchObject({ recoveredAttempts: 2 });
  });

  it("two concurrent executions of ONE request id each reserve a distinct attempt before sending (PostgreSQL)", async () => {
    const { owner, ws, conn } = await tenant("Concurrent");
    await priceModel(ws.id);
    const requestId = `t:${randomUUID()}`;
    const before = (await oaChats()).length;
    const [a, b] = await Promise.all([exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId }), exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId })]);
    expect((await oaChats()).length - before).toBe(2);
    const rows = await ledger(requestId);
    expect(rows.map((u) => u.idempotencyKey).sort()).toEqual([`${requestId}:1`, `${requestId}:2`]);
    expect(rows.every((u) => u.status === "settled" && Number(u.costMicros) > 0)).toBe(true);
    expect(new Set([a.usageKey, b.usageKey]).size).toBe(2);
  });
});

/* ───────── CXH-04 ───────── */

describe("CXH-04: the agent's cost limit covers every hub reservation", () => {
  const limits = (maxCostMicros: number | null) => ({ maxSteps: 6, maxToolCalls: 4, maxCostMicros, timeoutMs: 20_000 });
  const start = (agentId: string, owner: CurrentUser) => startAgentRun({ agentId, message: "Say hello.", actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } });

  it("a charged failed attempt + the retry can't pass the agent's limit (the agent counts the ledger, not only the answer)", async () => {
    const { owner, ws } = await tenant("AgCap");
    await priceModel(ws.id);
    // Measure one attempt's defensible maximum for this agent's first model call.
    const probe = await createAgent(owner, ws.id, { name: "Probe", instructions: "Answer briefly.", tools: [], limits: limits(null) });
    const pr = await runAgent((await start(probe.id, owner)).id);
    expect(pr.status).toBe("succeeded");
    const max = Number((await agentLedger(pr.id)).find((u) => u.kind === "ai")!.estimatedMicros);
    expect(max).toBeGreaterThan(0);

    const capped = await createAgent(owner, ws.id, { name: "Capped", instructions: "Answer briefly.", tools: [], limits: limits(max + 50) });
    // The first attempt returns a 200 without a message: possibly billed → settled at its reservation; then retried.
    await hubFault({ provider: "openai", mode: "json", body: {} });
    const run = await runAgent((await start(capped.id, owner)).id);
    const rows = await agentLedger(run.id);
    expect(run).toMatchObject({ status: "failed", error: { code: "AGENT_COST_LIMIT" } });
    expect(spentOf(rows)).toBeLessThanOrEqual(max + 50); // the ledger never passes the agent's limit
    expect(run.costMicros).toBe(spentOf(rows)); // and the agent reports what the ledger holds
  });

  // Retest CXH-04 (cceeb5d): the workspace's unknown-cost override used to lift the agent's hard cap (this test
  // asserted that). Correct behaviour: the override alone never does; only the AGENT's explicit opt-in (limits
  // .allowUnknownCost, which gives up the cap guarantee for such calls) lets an unknown-price call run under a cap.
  it("an unknown price under an agent limit is refused — even when the owner allows unknown cost — unless the agent opts in; then it is recorded as unknown, not 0", async () => {
    const { owner, ws } = await tenant("AgUnknown");
    await uncappedPlan(ws.id); // no workspace/plan cap: only the agent's limit applies
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: false });
    const agent = await createAgent(owner, ws.id, { name: "U", instructions: "Answer briefly.", tools: [], limits: limits(1_000) });
    const before = (await oaChats()).length;
    const refused = await runAgent((await start(agent.id, owner)).id);
    expect(refused).toMatchObject({ status: "failed", error: { code: "AI_COST_UNKNOWN" } });
    expect((await oaChats()).length).toBe(before); // nothing was sent

    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true });
    const stillRefused = await runAgent((await start(agent.id, owner)).id);
    expect(stillRefused).toMatchObject({ status: "failed", error: { code: "AI_COST_UNKNOWN" } });
    expect((await oaChats()).length).toBe(before); // the workspace override alone doesn't lift the agent's cap

    const optIn = await createAgent(owner, ws.id, { name: "U2", instructions: "Answer briefly.", tools: [], limits: { ...limits(1_000), allowUnknownCost: true } });
    const allowed = await runAgent((await start(optIn.id, owner)).id);
    expect(allowed.status).toBe("succeeded");
    const [model] = await db.select().from(schema.agentStep).where(and(eq(schema.agentStep.agentRunId, allowed.id), eq(schema.agentStep.kind, "model")));
    expect(model!.costMicros).toBeNull();
    expect(model!.args).toMatchObject({ costSource: "unknown" });
  });
});

/* ───────── CXH-07 / CXH-08 ───────── */

describe("CXH-07 / CXH-08: reservations and settlement", () => {
  it("the reservation counts historical tool-call arguments (the whole protocol request)", async () => {
    const { owner, ws, conn } = await tenant("Reserve");
    await priceModel(ws.id);
    const convo = (args: Record<string, unknown>): HubChatRequest => ({
      system: "Answer.",
      maxTokens: 20,
      messages: [
        { role: "user", content: "look it up" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "lookup", arguments: args }] },
        { role: "tool", toolCallId: "c1", name: "lookup", content: "ok" },
        { role: "user", content: "and?" },
      ],
    });
    const small = `t:${randomUUID()}`;
    const big = `t:${randomUUID()}`;
    await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId: small, request: convo({}) }).catch(() => null);
    await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId: big, request: convo({ blob: "x".repeat(20_000) }) }).catch(() => null);
    const est = async (id: string) => Number((await ledger(id))[0]!.estimatedMicros);
    // 20,000 argument characters are at least 10,000 reserved tokens (~2 chars per token) at 1 micro-unit each.
    expect((await est(big)) - (await est(small))).toBeGreaterThanOrEqual(10_000);
  });

  it("a 200 with usage:{} settles at the reservation (unknown), never at 0", async () => {
    const { owner, ws, conn } = await tenant("NoUsage");
    await priceModel(ws.id);
    await hubFault({ provider: "openai", mode: "json", body: { model: "fake-gpt-mini", choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: {} } });
    const requestId = `t:${randomUUID()}`;
    const r = await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId });
    expect(r.costSource).toBe("unknown");
    const [row] = await ledger(requestId);
    expect(row!.status).toBe("settled");
    expect(Number(row!.costMicros)).toBe(Number(row!.estimatedMicros));
    expect(Number(row!.costMicros)).toBeGreaterThan(0);
    expect([row!.inputTokens, row!.outputTokens]).toEqual([null, null]);
    const [a] = await attemptsFor(requestId);
    expect(a).toMatchObject({ outcome: "success", costSource: "unknown", inputTokens: null, outputTokens: null });
  });
});

/* ───────── CXH-11 ───────── */

describe("CXH-11: a public model list is not a key check", () => {
  it("DeepInfra / Vercel: an invalid key with a public listing is saved UNVERIFIED — never 'connection works'", async () => {
    for (const provider of ["deepinfra", "vercel-gateway"]) {
      const owner = await makeUser(`pub-${provider}`);
      const ws = await createWorkspace(owner, unique("Pub"));
      await post("/__fake/hub/public", { providers: [provider] });
      const c = await createAiConnection(db, owner.id, ws.id, { provider, label: provider, apiKey: "not-a-valid-key-000000000000" });
      expect(c, provider).toMatchObject({ keyCheck: "public-listing", keyVerified: false, lastTestedAt: null });
      const t = await testAiConnection(db, await getAiConnection(db, ws.id, c.id));
      expect(t, provider).toMatchObject({ ok: false, code: "AI_KEY_NOT_CHECKABLE" });
      expect(t.connection).toMatchObject({ keyVerified: false, lastTestedAt: null });
    }
  });

  it("OpenRouter: the key is checked with its authenticated, non-billable key endpoint — a public listing can't pass an invalid key", async () => {
    const owner = await makeUser("or-key");
    const ws = await createWorkspace(owner, unique("OR"));
    await post("/__fake/hub/public", { providers: ["openrouter"] });
    await expectHttpError(createAiConnection(db, owner.id, ws.id, { provider: "openrouter", label: "or", apiKey: "not-a-valid-key-000000000000" }), 400, "AI_KEY_REJECTED");
    const ok = await createAiConnection(db, owner.id, ws.id, { provider: "openrouter", label: "or", apiKey: fakeKey("openrouter") });
    expect(ok).toMatchObject({ keyCheck: "key-endpoint", keyVerified: true });
  });
});

/* ───────── CXH-12 ───────── */

describe("CXH-12: post-network health and catalogue writes are fenced", () => {
  it("a key test that finishes after a disconnect never writes CONNECTED over REVOKED", async () => {
    const { ws, conn } = await tenant("FenceRevoke");
    const row = await getAiConnection(db, ws.id, conn.id);
    await oaFault({ mode: "slow", path: "models", delayMs: 1_500 });
    const pending = testAiConnection(db, row);
    await sleep(400);
    await disconnectAiConnection(db, row);
    await pending.catch(() => null);
    const after = await getAiConnection(db, ws.id, conn.id);
    expect(after.status).toBe("REVOKED");
    expect(after.secretEnc).toBeNull();
  });

  it("an old-key discovery that finishes after a key rotation doesn't overwrite the catalogue", async () => {
    const { ws, conn } = await tenant("FenceRotate");
    const old = await getAiConnection(db, ws.id, conn.id);
    await oaFault({ mode: "slow", path: "models", delayMs: 1_500 });
    const pending = refreshCatalogue(db, old);
    await sleep(400);
    await replaceAiKey(db, old, fakeKey("rotated"));
    const rotated = await getAiConnection(db, ws.id, conn.id);
    await post("/__fake/openai/catalogue", { remove: "fake-gpt-large" }); // only the stale (old-key) answer lacks it
    const r = await pending;
    expect(r.ok).toBe(false);
    const [m] = await db.select().from(schema.aiConnectionModel).where(and(eq(schema.aiConnectionModel.connectionId, conn.id), eq(schema.aiConnectionModel.modelId, "fake-gpt-large")));
    expect(m!.removedAt).toBeNull();
    expect((await getAiConnection(db, ws.id, conn.id)).catalogRefreshedAt).toEqual(rotated.catalogRefreshedAt);
  });
});

/* ───────── CXH-13 ───────── */

describe("CXH-13: FALLBACK handles a primary model that discovery marked removed", () => {
  async function removedPrimary(name: string) {
    const t = await tenant(name);
    await post("/__fake/openai/catalogue", { remove: "fake-gpt-large" });
    expect((await refreshCatalogue(db, await getAiConnection(db, t.ws.id, t.conn.id))).ok).toBe(true);
    const [m] = await db.select().from(schema.aiConnectionModel).where(and(eq(schema.aiConnectionModel.connectionId, t.conn.id), eq(schema.aiConnectionModel.modelId, "fake-gpt-large")));
    expect(m!.removedAt).not.toBeNull();
    return t;
  }

  it("the approved fallback answers; the removed primary is listed as skipped", async () => {
    const { owner, ws, conn } = await removedPrimary("FbRemoved");
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(conn, "fake-gpt-mini")] });
    const flow = await aiFlow(owner, ws.id, { route: ref(conn, "fake-gpt-large") });
    const r = await enqueueRun(owner, flow.id);
    await claimAndProcess(r.id);
    const run = await freshRun(r.id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    expect((await stepOf(r.id)).meta).toMatchObject({ model: "fake-gpt-mini", routesSkipped: [{ modelId: "fake-gpt-large", code: "AI_MODEL_REMOVED" }] });
  });

  it("MANUAL still refuses at once; a revoked primary is never a reason to fall back", async () => {
    const { owner, ws, conn } = await removedPrimary("FbManual");
    const flow = await aiFlow(owner, ws.id, { route: ref(conn, "fake-gpt-large") });
    const r = await enqueueRun(owner, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).error).toMatchObject({ code: "AI_MODEL_REMOVED" });

    const other = await createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "Other", apiKey: fakeKey("other") });
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(other, "fake-gpt-mini")] });
    const pinned = await aiFlow(owner, ws.id, { route: ref(conn, "fake-gpt-mini") }); // saved while the connection is live
    await disconnectAiConnection(db, await getAiConnection(db, ws.id, conn.id));
    const before = (await oaChats()).length;
    const r2 = await enqueueRun(owner, pinned.id);
    await claimAndProcess(r2.id);
    expect((await freshRun(r2.id)).error).toMatchObject({ code: "AI_CONNECTION_REVOKED" });
    expect((await oaChats()).length).toBe(before);
  });
});
