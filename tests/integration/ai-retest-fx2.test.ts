/**
 * Regression tests for the Codex retest of cceeb5d (artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST-cceeb5d.md), second
 * fix round: CXH-04 (an agent's hard cap vs. unknown cost, fallback charging, tool reservations), CXH-18 (a resumed
 * tool reservation is counted once), CXH-17 (abandonment is fenced on execution ownership; a late success
 * reconciles), CXH-19 (primary/fallback identity survives filtering), CXH-09 (false-zero listing prices),
 * CXH-11 (verification method + credential version) and CXH-12 (shared catalogue writes are fenced and ordered).
 * PostgreSQL + the protocol-accurate AI test double.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncCurated } from "@/ai/hub/catalogue";
import { createAiConnection, getAiConnection, inferenceTest, publicAiConnection, replaceAiKey, setUseRoles } from "@/ai/hub/connections";
import { discoveryTestHooks, refreshCatalogue } from "@/ai/hub/discovery";
import { executeAi } from "@/ai/hub/execute";
import { resolveRoute } from "@/ai/hub/routing";
import type { HubChatRequest } from "@/ai/hub/types";
import { db, pool, schema } from "@/db";
import type { AiPolicy, AiRouteRef } from "@/db/schema";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import type { CurrentUser } from "@/server/access";
import { createAgent, startAgentRun } from "@/server/agents";
import { createFlow, saveFlow } from "@/server/flows";
import { addSource, indexNextSource } from "@/server/knowledge";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { claimNextAgentRun, processAgentRun, wakeAgentsForFinishedRuns } from "../../worker/agent-runner";
import { claimNextRun, processRun } from "../../worker/runner";
import { connectAi, fakeKey, MODEL_PROVIDER_ENV_KEYS, useAiDouble } from "./ai-helpers";
import { addMember, claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

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
  for (let i = 0; i < 100; i++) {
    const id = await claimNextAgentRun(db, "drain");
    if (!id) break;
    await processAgentRun(db, id, "drain");
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
  discoveryTestHooks.afterFence = undefined;
});

/* ───────── helpers ───────── */

const post = (p: string, body: unknown) => fetch(`${ai.url}${p}`, { method: "POST", body: JSON.stringify(body) });
const hubFault = (f: Record<string, unknown>) => post("/__fake/hub/fault", { times: 1, ...f });
const oaFault = (f: Record<string, unknown>) => post("/__fake/openai/fault", { times: 1, ...f });
const oaChats = async () => ((await (await fetch(`${ai.url}/__fake/openai/requests`)).json()) as { requests: { method: string; path: string }[] }).requests.filter((r) => r.method === "POST" && r.path.endsWith("/chat/completions"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => Promise<boolean> | boolean, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
const setPolicy = (wsId: string, p: AiPolicy) => db.update(schema.workspace).set({ aiPolicy: p }).where(eq(schema.workspace.id, wsId));
const wsRow = async (id: string) => (await db.select().from(schema.workspace).where(eq(schema.workspace.id, id)))[0]!;
const ref = (c: { id: string }, modelId: string): AiRouteRef => ({ connectionId: c.id, modelId });
const PRICE = { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 1_000_000 }; // 1 micro-unit per token
const setPrices = (wsId: string, prices: Record<string, unknown>) => db.update(schema.workspace).set({ prices: prices as never }).where(eq(schema.workspace.id, wsId));
const ledger = (requestId: string) =>
  db
    .select()
    .from(schema.usageEvent)
    .where(like(schema.usageEvent.idempotencyKey, `${requestId}:%`))
    .orderBy(schema.usageEvent.id);
const attemptsFor = (requestId: string) => db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.requestId, requestId)).orderBy(schema.aiAttempt.id);
const agentLedger = (agentRunId: string) => db.select().from(schema.usageEvent).where(eq(schema.usageEvent.agentRunId, agentRunId));
const spentOf = (rows: { status: string; costMicros: number }[]) => rows.filter((r) => r.status !== "released").reduce((n, r) => n + Number(r.costMicros), 0);

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
const doubleGraph = (): FlowGraph => ({
  nodes: [node("t", "trigger.manual", { samplePayload: '{ "n": 1 }' }), node("x", "transform.json", { expression: '{ "v": n * 2 }' }, 200), node("o", "output", { key: "r", expression: "" }, 400)],
  edges: [
    { id: "e1", source: "t", target: "x" },
    { id: "e2", source: "x", target: "o" },
  ],
});

/** Processes agent runs (no workflow worker: child workflow runs are driven by the test). */
async function runAgent(agentRunId: string) {
  await wakeAgentsForFinishedRuns(db);
  for (let i = 0; i < 10; i++) {
    const w = unique("a");
    const id = await claimNextAgentRun(db, w);
    if (!id) break;
    await processAgentRun(db, id, w);
    if (id === agentRunId) break;
  }
  return (await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, agentRunId)))[0]!;
}
const limits = (maxCostMicros: number | null, extra: Record<string, unknown> = {}) => ({ maxSteps: 8, maxToolCalls: 6, maxCostMicros, timeoutMs: 20_000, ...extra });
const start = (agentId: string, owner: CurrentUser, message = "Say hello.") => startAgentRun({ agentId, message, actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } });

/* ───────── CXH-04 ───────── */

describe("CXH-04: an agent's hard cap holds under the workspace unknown-cost override", () => {
  it("unknown price + capped agent: refused unsent even though the workspace allows unknown cost; only the agent's explicit opt-in sends it (recorded as unknown)", async () => {
    const { owner, ws } = await tenant("CapUnknown");
    await uncappedPlan(ws.id);
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true }); // the WORKSPACE allows unknown cost
    const capped = await createAgent(owner, ws.id, { name: "Capped", instructions: "Answer briefly.", tools: [], limits: limits(1_000) });
    const before = (await oaChats()).length;
    const refused = await runAgent((await start(capped.id, owner)).id);
    expect(refused).toMatchObject({ status: "failed", error: { code: "AI_COST_UNKNOWN" } });
    expect((await oaChats()).length).toBe(before); // nothing was sent
    expect((await agentLedger(refused.id)).filter((u) => u.kind === "ai")).toHaveLength(0); // no 0-cost reservation under the cap

    // The agent's own, explicit choice to give up the cap guarantee for unknown-price calls.
    const optIn = await createAgent(owner, ws.id, { name: "OptIn", instructions: "Answer briefly.", tools: [], limits: limits(1_000, { allowUnknownCost: true }) });
    const allowed = await runAgent((await start(optIn.id, owner)).id);
    expect(allowed.status, JSON.stringify(allowed.error)).toBe("succeeded");
    const [model] = await db.select().from(schema.agentStep).where(and(eq(schema.agentStep.agentRunId, allowed.id), eq(schema.agentStep.kind, "model")));
    expect(model!.costMicros).toBeNull();
    expect(model!.args).toMatchObject({ costSource: "unknown" });
    const [ev] = (await agentLedger(allowed.id)).filter((u) => u.kind === "ai");
    expect(ev).toMatchObject({ status: "settled", unpriced: true });
  });

  it("the hub itself refuses an unknown price under an agent cap without the agent's opt-in (policy override alone is not enough)", async () => {
    const { owner, ws, conn } = await tenant("HubCapUnknown");
    await uncappedPlan(ws.id);
    const requestId = `t:${randomUUID()}`;
    const agentRunId = randomUUID();
    await expect(exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, agentRunId, agentCapMicros: 5_000, policy: { mode: "MANUAL", allowUnknownCost: true } })).rejects.toMatchObject({ code: "AI_COST_UNKNOWN" });
    expect(await ledger(requestId)).toHaveLength(0);
    const ok = await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId: `${requestId}b`, agentRunId, agentCapMicros: 5_000, agentAllowsUnknownCost: true, policy: { mode: "MANUAL", allowUnknownCost: true } });
    expect(ok.costSource).toBe("unknown");
  });

  it("fallback charging: a primary route's possible charges count toward the cap when the policy moves to a fallback", async () => {
    const { owner, ws, conn } = await tenant("CapFallback");
    await uncappedPlan(ws.id);
    const other = await createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "Other", apiKey: fakeKey("other") });
    await setPrices(ws.id, { "ai:openai/fake-gpt-large": PRICE, "ai:openai/fake-gpt-mini": PRICE });
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: false, fallbackRoutes: [ref(other, "fake-gpt-mini")] });
    const route = ref(conn, "fake-gpt-large");
    const probe = await createAgent(owner, ws.id, { name: "Probe", instructions: "Answer briefly.", route, tools: [], limits: limits(null) });
    const pr = await runAgent((await start(probe.id, owner)).id);
    expect(pr.status, JSON.stringify(pr.error)).toBe("succeeded");
    const M = Number((await agentLedger(pr.id)).find((u) => u.kind === "ai")!.estimatedMicros);
    expect(M).toBeGreaterThan(0);

    // Three possibly-billed failures on the primary (each settled at its reservation), then the fallback.
    const tight = await createAgent(owner, ws.id, { name: "Tight", instructions: "Answer briefly.", route, tools: [], limits: limits(3 * M + Math.floor(M / 2)) });
    await hubFault({ provider: "openai", mode: "json", body: {}, times: 3 });
    const t = await runAgent((await start(tight.id, owner)).id);
    const tRows = await agentLedger(t.id);
    expect(t).toMatchObject({ status: "failed", error: { code: "AGENT_COST_LIMIT" } });
    expect(tRows.filter((u) => u.kind === "ai" && u.status === "settled")).toHaveLength(3);
    expect(tRows.filter((u) => u.model === "fake-gpt-mini")).toHaveLength(0); // the fallback was never reserved/sent
    expect(spentOf(tRows)).toBeLessThanOrEqual(3 * M + Math.floor(M / 2));
    expect(t.costMicros).toBe(spentOf(tRows));

    // A fresh primary connection: the three failures above opened the first one's circuit breaker.
    const primary2 = await createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "Primary 2", apiKey: fakeKey("p2") });
    const roomy = await createAgent(owner, ws.id, { name: "Roomy", instructions: "Answer briefly.", route: ref(primary2, "fake-gpt-large"), tools: [], limits: limits(4 * M + 10) });
    await hubFault({ provider: "openai", mode: "json", body: {}, times: 3 });
    const r = await runAgent((await start(roomy.id, owner)).id);
    const rRows = await agentLedger(r.id);
    expect(r.status, JSON.stringify(r.error)).toBe("succeeded");
    expect(rRows.filter((u) => u.kind === "ai" && u.model === "fake-gpt-mini" && u.status === "settled")).toHaveLength(1);
    expect(spentOf(rRows)).toBeLessThanOrEqual(4 * M + 10);
    expect(r.costMicros).toBe(spentOf(rRows)); // the three possible charges + the fallback's actual cost
  }, 30_000);

  it("tool reservations: a priced tool step that would pass the cap is refused inside the locked reservation", async () => {
    const { owner, ws } = await tenant("CapTool");
    await uncappedPlan(ws.id);
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": { inputPerMTokMicros: 0, outputPerMTokMicros: 0, perCallMicros: 10 }, "agent_step:*": { perCallMicros: 100 } });
    const src = await addSource(db, owner, ws.id, { name: "Doc", kind: "text", mime: "text/plain", bytes: Buffer.from("loop loop loop") });
    while (await indexNextSource(db, unique("i"))) {
      /* index */
    }
    const agent = await createAgent(owner, ws.id, { name: "Search", instructions: "Search.", tools: [{ tool: "knowledge_search", permission: "allow" }], knowledgeSourceIds: [src.id], limits: limits(150) });
    // model 10 → tool 100 (110) → model 10 (120) → the next tool (+100) would pass 150.
    const run = await runAgent((await start(agent.id, owner, "[loop] keep going")).id);
    const rows = await agentLedger(run.id);
    expect(run, JSON.stringify(rows.map((u) => [u.kind, u.status, u.costMicros]))).toMatchObject({ status: "failed", error: { code: "AGENT_COST_LIMIT" } });
    expect(spentOf(rows)).toBeLessThanOrEqual(150);
    expect(rows.filter((u) => u.kind === "agent_step")).toHaveLength(1);
    expect(run.costMicros).toBe(spentOf(rows));
  });
});

/* ───────── CXH-18 ───────── */

describe("CXH-18: a resumed tool reservation is counted once", () => {
  async function pausedOnChild(cap: number) {
    const { owner, ws } = await tenant(`Resume${cap}`);
    await uncappedPlan(ws.id);
    // Every model call costs exactly 10; every tool step 100.
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": { inputPerMTokMicros: 0, outputPerMTokMicros: 0, perCallMicros: 10 }, "agent_step:*": { perCallMicros: 100 } });
    const flow = await createFlow(owner, ws.id, { name: `Doubler ${unique("f")}` });
    await saveFlow(owner, flow.id, { baseRevision: 1, graph: doubleGraph() });
    await publishFlow(owner, flow.id);
    const agent = await createAgent(owner, ws.id, { name: "Runner", instructions: "Run workflows.", tools: [{ tool: "run_workflow", flowId: flow.id, permission: "allow" }], limits: limits(cap) });
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    const run = await start(agent.id, owner, `run ${f!.name} with {"n": 3}`);
    // The child workflow run waits for a human decision (driven here: no workflow worker runs it).
    let stop = false;
    const child = (async () => {
      while (!stop) {
        const [c] = await db.select().from(schema.run).where(eq(schema.run.agentRunId, run.id));
        if (c) {
          await db.update(schema.run).set({ status: "waiting_approval" }).where(eq(schema.run.id, c.id));
          return c.id;
        }
        await sleep(20);
      }
      return null;
    })();
    const paused = await runAgent(run.id);
    stop = true;
    const childId = await child;
    expect(paused.status, JSON.stringify(paused.error)).toBe("waiting_approval");
    expect(spentOf(await agentLedger(run.id))).toBe(110); // model 10 + the tool's reservation 100
    // The approver approves and the child finishes: the agent is woken and resumes the pending tool call.
    await db.update(schema.run).set({ status: "succeeded", output: { r: { v: 6 } }, finishedAt: new Date() }).where(eq(schema.run.id, childId!));
    return runAgent(run.id);
  }

  it("cap 150 (110 held): the resumed tool doesn't reserve its 100 again — the run finishes at 120", async () => {
    const r = await pausedOnChild(150);
    expect(r.status, JSON.stringify(r.error)).toBe("succeeded");
    const rows = await agentLedger(r.id);
    expect(spentOf(rows)).toBe(120);
    expect(r.costMicros).toBe(120);
    expect(rows.filter((u) => u.kind === "agent_step")).toHaveLength(1);
  });

  it("cap 200: the completed tool's cost isn't added on top of the ledger (reported spend = ledger)", async () => {
    const r = await pausedOnChild(200);
    expect(r.status, JSON.stringify(r.error)).toBe("succeeded");
    expect(r.costMicros).toBe(spentOf(await agentLedger(r.id)));
    expect(r.costMicros).toBe(120);
  });
});

/* ───────── CXH-17 ───────── */

describe("CXH-17: abandonment is fenced on execution ownership", () => {
  async function leasedRun(owner: CurrentUser, wsId: string, holder: string) {
    const flow = await aiFlow(owner, wsId);
    const r = await enqueueRun(owner, flow.id);
    await db.update(schema.run).set({ status: "running", lockedBy: holder, heartbeatAt: new Date() }).where(eq(schema.run.id, r.id));
    return r.id;
  }

  it("a live attempt older than the old 60 s threshold is not abandoned by a second execution of the same request id", async () => {
    const { owner, ws, conn } = await tenant("LiveAttempt");
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": PRICE });
    const runId = await leasedRun(owner, ws.id, "w-live");
    const requestId = `t:${randomUUID()}`;
    await oaFault({ mode: "slow", path: "chat", delayMs: 2_500 });
    const a = exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    await until(async () => (await ledger(requestId)).length === 1, "attempt A to reserve");
    // A has been in flight for 61 s (its provider may take up to 120 s); its worker still holds the run lease.
    await db.update(schema.usageEvent).set({ createdAt: new Date(Date.now() - 61_000) }).where(eq(schema.usageEvent.idempotencyKey, `${requestId}:1`));
    await db.update(schema.run).set({ heartbeatAt: new Date() }).where(eq(schema.run.id, runId));
    const b = await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    const ra = await a;
    expect([ra.usageKey, b.usageKey].sort()).toEqual([`${requestId}:1`, `${requestId}:2`]);
    const att = await attemptsFor(requestId);
    expect(att.some((x) => x.errorCode === "AI_ATTEMPT_ABANDONED")).toBe(false);
    expect(att.map((x) => [x.attempt, x.outcome]).sort()).toEqual([
      [1, "success"],
      [2, "success"],
    ]);
    const rows = await ledger(requestId);
    // Both settled at their ACTUAL cost (A's settlement was not pre-empted by a forced estimate).
    for (const u of rows) {
      expect(u.status).toBe("settled");
      expect(Number(u.costMicros)).toBeLessThan(Number(u.estimatedMicros));
    }
    expect(Number(rows[0]!.costMicros)).toBe(ra.costMicros);
  });

  it("a lost lease makes the reservation abandoned; a late success of that attempt reconciles the ledger", async () => {
    const { owner, ws, conn } = await tenant("LateSuccess");
    await setPrices(ws.id, { "ai:openai/fake-gpt-mini": PRICE });
    const runId = await leasedRun(owner, ws.id, "w-old");
    const requestId = `t:${randomUUID()}`;
    await oaFault({ mode: "slow", path: "chat", delayMs: 2_500 });
    const a = exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    await until(async () => (await ledger(requestId)).length === 1, "attempt A to reserve");
    // The old worker lost its lease (recovery gave the run to another worker), so its open reservation is abandoned.
    await db.update(schema.run).set({ lockedBy: "w-new", heartbeatAt: new Date() }).where(eq(schema.run.id, runId));
    await exec(ws.id, owner, ref(conn, "fake-gpt-mini"), { requestId, runId });
    let rows = await ledger(requestId);
    expect(rows[0]).toMatchObject({ status: "settled" });
    expect(Number(rows[0]!.costMicros)).toBe(Number(rows[0]!.estimatedMicros)); // kept as a possible charge meanwhile
    const placeholder = (await attemptsFor(requestId)).find((x) => x.attempt === 1)!;
    expect(placeholder).toMatchObject({ outcome: "interrupted", errorCode: "AI_ATTEMPT_ABANDONED" });

    const ra = await a; // …and then the "abandoned" attempt answers after all.
    rows = await ledger(requestId);
    expect(Number(rows[0]!.costMicros)).toBe(ra.costMicros); // reconciled to the real cost, not left at the estimate
    expect(Number(rows[0]!.costMicros)).toBeLessThan(Number(rows[0]!.estimatedMicros));
    expect(rows[0]!.inputTokens).not.toBeNull();
    const att = await attemptsFor(requestId);
    expect(att.find((x) => x.id === placeholder.id)).toMatchObject({ errorCode: "AI_ATTEMPT_RECONCILED", possibleCharge: false });
    expect(att.filter((x) => x.attempt === 1 && x.outcome === "success")).toHaveLength(1);
  });
});

/* ───────── CXH-13 / CXH-19 ───────── */

describe("CXH-19: refusal handling follows route identity, not the filtered index", () => {
  it("removed primary → forbidden first fallback (owner-only) → the allowed second fallback answers for an editor", async () => {
    const owner = await makeUser("fb-own");
    const editor = await makeUser("fb-ed");
    const ws = await createWorkspace(owner, unique("FbIdentity"));
    await addMember(ws.id, editor.id, "editor");
    const { connection: shared } = await connectAi(owner, ws.id, { useRoles: ["owner", "editor"] });
    const ownerOnly = await createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "Owner only", apiKey: fakeKey("own") });
    await setUseRoles(db, await getAiConnection(db, ws.id, ownerOnly.id), ["owner"]);
    await post("/__fake/openai/catalogue", { remove: "fake-gpt-large" });
    expect((await refreshCatalogue(db, await getAiConnection(db, ws.id, shared.id))).ok).toBe(true);
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(ownerOnly, "fake-gpt-mini"), ref(shared, "fake-gpt-mini")] });
    const flow = await aiFlow(owner, ws.id, { route: ref(shared, "fake-gpt-large") });
    const r = await enqueueRun(editor, flow.id);
    await claimAndProcess(r.id);
    const run = await freshRun(r.id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    expect((await stepOf(r.id)).meta).toMatchObject({ model: "fake-gpt-mini", connectionId: shared.id, routesSkipped: [{ modelId: "fake-gpt-large", code: "AI_MODEL_REMOVED" }] });
    const att = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.runId, r.id));
    expect(att.find((a) => a.connectionId === ownerOnly.id)).toMatchObject({ outcome: "refused", errorCode: "AI_ROUTE_FORBIDDEN" });
  });

  it("the PRIMARY route's refusal is still final (identity, not position)", async () => {
    const owner = await makeUser("fbp-own");
    const editor = await makeUser("fbp-ed");
    const ws = await createWorkspace(owner, unique("FbPrimary"));
    await addMember(ws.id, editor.id, "editor");
    const { connection: shared } = await connectAi(owner, ws.id, { useRoles: ["owner", "editor"] });
    const flow = await aiFlow(owner, ws.id, { route: ref(shared, "fake-gpt-mini") });
    await setUseRoles(db, await getAiConnection(db, ws.id, shared.id), ["owner"]);
    const other = await createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "Other", apiKey: fakeKey("oth") });
    await setUseRoles(db, await getAiConnection(db, ws.id, other.id), ["owner", "editor"]);
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(other, "fake-gpt-mini")] });
    const r = await enqueueRun(editor, flow.id);
    await claimAndProcess(r.id);
    expect((await freshRun(r.id)).error).toMatchObject({ code: "AI_ROUTE_FORBIDDEN" });
  });
});

/* ───────── CXH-09 ───────── */

const dataStep = () => {
  const dir = path.join(process.cwd(), "drizzle");
  const file = readdirSync(dir).find((f) => /_hub_retest_data\.sql$/.test(f));
  if (!file) throw new Error("the hub retest data-step migration is missing");
  return readFileSync(path.join(dir, file), "utf8");
};
async function runDataStep() {
  for (const stmt of dataStep().split("--> statement-breakpoint")) if (stmt.trim()) await pool.query(stmt);
}

describe("CXH-09: historical false-zero listing prices", () => {
  const OR_LISTING = "listing:openrouter-models-list";
  const zero = { inputPerMTokMicros: 0, outputPerMTokMicros: 0, currency: "USD", sourceUrl: "https://openrouter.ai/docs/api/api-reference/models/get-models", verifiedAt: "2026-09-01" };
  const seed = (modelId: string, pricing: Record<string, unknown> | null, source = OR_LISTING) =>
    db
      .insert(schema.aiModel)
      .values({ provider: "openrouter", modelId, protocol: "openai-chat", capabilities: {} as never, pricing: pricing as never, source, freeTierNote: pricing ? "Zero-priced in OpenRouter's model list" : null, snapshotVersion: 1, lifecycle: "active" })
      .onConflictDoUpdate({ target: [schema.aiModel.provider, schema.aiModel.modelId], set: { pricing: pricing as never, source, observedAt: null } });
  const cat = async (provider: string, modelId: string) => (await db.select().from(schema.aiModel).where(and(eq(schema.aiModel.provider, provider), eq(schema.aiModel.modelId, modelId))))[0];

  it("a malformed authoritative price clears a stored pre-fix zero (never kept); a listing without prices keeps the known one", async () => {
    const owner = await makeUser("cx9");
    const ws = await createWorkspace(owner, unique("Cx9"));
    const c = await createAiConnection(db, owner.id, ws.id, { provider: "openrouter", label: "or", apiKey: fakeKey("openrouter") });
    const bad = `acme/blank-${randomUUID().slice(0, 8)}`;
    const none = `acme/none-${randomUUID().slice(0, 8)}`;
    await seed(bad, zero); // written by the pre-fix parser from "" prices
    await seed(none, { ...zero, inputPerMTokMicros: 2_000_000, outputPerMTokMicros: 4_000_000 });
    await hubFault({ provider: "openrouter", path: "models", mode: "json", body: { data: [{ id: bad, pricing: { prompt: "", completion: "" } }, { id: none }], total_count: 2 } });
    expect((await refreshCatalogue(db, await getAiConnection(db, ws.id, c.id))).ok).toBe(true);
    const b = await cat("openrouter", bad);
    expect(b!.pricing).toBeNull();
    expect(b!.freeTierNote).toBeNull();
    expect((await cat("openrouter", none))!.pricing).toMatchObject({ inputPerMTokMicros: 2_000_000, outputPerMTokMicros: 4_000_000 });
  });

  it("data step: listing-sourced zero prices are invalidated (unknown); curated verified-free prices are kept", async () => {
    const legacy = `acme/legacy-${randomUUID().slice(0, 8)}`;
    await seed(legacy, zero);
    await syncCurated(db, "zai");
    await runDataStep();
    expect((await cat("openrouter", legacy))!.pricing).toBeNull();
    expect((await cat("zai", "glm-4.7-flash"))!.pricing).toMatchObject({ inputPerMTokMicros: 0, outputPerMTokMicros: 0 });
  });
});

/* ───────── CXH-11 ───────── */

describe("CXH-11: verification method + credential version (upgrade state)", () => {
  it("a pre-fix public-listing 'verification' is not a key check; a key-required listing is honoured after the data step; a later key version isn't", async () => {
    const owner = await makeUser("cx11");
    const ws = await createWorkspace(owner, unique("Cx11"));
    await uncappedPlan(ws.id);
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true });
    await post("/__fake/hub/public", { providers: ["deepinfra"] });
    const pub = await createAiConnection(db, owner.id, ws.id, { provider: "deepinfra", label: "di", apiKey: fakeKey("deepinfra") });
    // What the pre-fix code wrote after a successful PUBLIC listing: CONNECTED + a test timestamp, no method.
    await db.update(schema.aiConnection).set({ status: "CONNECTED", lastTestedAt: new Date(), keyCheckMethod: null, keyCheckedCredVersion: null }).where(eq(schema.aiConnection.id, pub.id));
    expect(publicAiConnection(await getAiConnection(db, ws.id, pub.id)).keyVerified).toBe(false);

    const oa = await createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "oa", apiKey: fakeKey("oa") });
    expect(oa).toMatchObject({ keyVerified: true, keyCheckMethod: "listing" });
    // Pre-fix key-required row: timestamp only.
    await db.update(schema.aiConnection).set({ keyCheckMethod: null, keyCheckedCredVersion: null }).where(eq(schema.aiConnection.id, oa.id));
    expect(publicAiConnection(await getAiConnection(db, ws.id, oa.id)).keyVerified).toBe(false);

    await runDataStep();
    const pubAfter = await getAiConnection(db, ws.id, pub.id);
    expect(publicAiConnection(pubAfter)).toMatchObject({ keyVerified: false, lastTestedAt: null });
    expect(publicAiConnection(await getAiConnection(db, ws.id, oa.id))).toMatchObject({ keyVerified: true, keyCheckMethod: "listing" });

    // A credential version the check didn't cover is not verified.
    await db.update(schema.aiConnection).set({ credVersion: 99 }).where(eq(schema.aiConnection.id, oa.id));
    expect(publicAiConnection(await getAiConnection(db, ws.id, oa.id)).keyVerified).toBe(false);

    // A disclosed inference test verifies the public-listing key (method "inference", current version).
    const [m] = await db.select().from(schema.aiConnectionModel).where(eq(schema.aiConnectionModel.connectionId, pub.id)).limit(1);
    const t = await inferenceTest(db, owner.id, await wsRow(ws.id), pubAfter, m!.modelId);
    expect(t.ok, JSON.stringify(t)).toBe(true);
    expect(publicAiConnection(await getAiConnection(db, ws.id, pub.id))).toMatchObject({ keyVerified: true, keyCheckMethod: "inference" });
  });
});

/* ───────── CXH-12 ───────── */

describe("CXH-12: shared catalogue writes are fenced and never go back in time", () => {
  const listing = (id: string, usdPerToken: string) => ({ data: [{ id, pricing: { prompt: usdPerToken, completion: usdPerToken } }], total_count: 1 });
  const priceOf = async (modelId: string) => (await db.select().from(schema.aiModel).where(and(eq(schema.aiModel.provider, "openrouter"), eq(schema.aiModel.modelId, modelId))))[0]?.pricing?.inputPerMTokMicros;
  /** Pauses the next refresh right after it passed its fence (test-only interleaving point). */
  function pauseAfterFence() {
    let reached = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    discoveryTestHooks.afterFence = async () => {
      discoveryTestHooks.afterFence = undefined;
      reached = true;
      await gate;
    };
    return { reached: () => reached, release: () => release() };
  }

  it("an old-key refresh paused after its fence can't overwrite what the rotation's newer listing stored", async () => {
    const owner = await makeUser("cx12a");
    const ws = await createWorkspace(owner, unique("Cx12a"));
    const c = await createAiConnection(db, owner.id, ws.id, { provider: "openrouter", label: "or", apiKey: fakeKey("openrouter") });
    const model = `acme/rot-${randomUUID().slice(0, 8)}`;
    await hubFault({ provider: "openrouter", path: "models", mode: "json", body: listing(model, "0.000001") }); // OLD: 1_000_000
    const p = pauseAfterFence();
    const old = refreshCatalogue(db, await getAiConnection(db, ws.id, c.id));
    await until(p.reached, "the old refresh to pass its fence");
    await hubFault({ provider: "openrouter", path: "models", mode: "json", body: listing(model, "0.000002") }); // NEW: 2_000_000
    const rotation = replaceAiKey(db, await getAiConnection(db, ws.id, c.id), fakeKey("openrouter2"));
    await sleep(500);
    p.release();
    await Promise.all([old, rotation]);
    expect(await priceOf(model)).toBe(2_000_000);
  });

  it("an older observation (another tenant's slower refresh) never overwrites a newer shared price", async () => {
    const mk = async (n: string) => {
      const owner = await makeUser(n);
      const ws = await createWorkspace(owner, unique(n));
      const c = await createAiConnection(db, owner.id, ws.id, { provider: "openrouter", label: "or", apiKey: fakeKey("openrouter") });
      return getAiConnection(db, ws.id, c.id);
    };
    const [a, b] = [await mk("cx12b"), await mk("cx12c")];
    const model = `acme/obs-${randomUUID().slice(0, 8)}`;
    await hubFault({ provider: "openrouter", path: "models", mode: "json", body: listing(model, "0.000001") });
    const p = pauseAfterFence();
    const older = refreshCatalogue(db, a);
    await until(p.reached, "tenant A's refresh to pass its fence");
    await hubFault({ provider: "openrouter", path: "models", mode: "json", body: listing(model, "0.000003") });
    expect((await refreshCatalogue(db, b)).ok).toBe(true); // newer observation, stored first
    expect(await priceOf(model)).toBe(3_000_000);
    p.release();
    expect((await older).ok).toBe(true);
    expect(await priceOf(model)).toBe(3_000_000);
  });
});
