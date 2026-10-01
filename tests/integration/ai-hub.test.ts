/**
 * AI provider hub (Wave A) — integration: workspace BYOK connections, isolation, permissions (selection AND
 * execution), secret redaction, discovery (malformed catalogue, removed models), cost policy, legacy local configs,
 * replace/disconnect fencing, restart persistence, no environment-key fallback. Provider = the OpenAI-compatible
 * TEST DOUBLE (e2e/fakes/ai-server.ts); every request it receives records a SHA-256 of the key that was used.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => {
    throw new Error("cookies() is not used by API routes");
  },
}));

import { GET as aiOverviewGET } from "@/app/api/workspaces/[wid]/ai/route";
import { GET as aiConnGET, PATCH as aiConnPATCH } from "@/app/api/workspaces/[wid]/ai/connections/[cid]/route";
import { GET as aiConnsGET, POST as aiConnsPOST } from "@/app/api/workspaces/[wid]/ai/connections/route";
import { GET as aiAffectedGET } from "@/app/api/workspaces/[wid]/ai/connections/[cid]/affected/route";
import { POST as aiTestPOST } from "@/app/api/workspaces/[wid]/ai/connections/[cid]/test/route";
import { GET as aiModelsGET } from "@/app/api/workspaces/[wid]/ai/models/route";
import { disconnectAiConnection, getAiConnection, replaceAiKey, setUseRoles } from "@/ai/hub/connections";
import { refreshCatalogue } from "@/ai/hub/discovery";
import { executeAi } from "@/ai/hub/execute";
import { resolveRoute } from "@/ai/hub/routing";
import { legacyReport } from "@/ai/hub/status";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/server/access";
import { createAgent, startAgentRun } from "@/server/agents";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace, updateWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { claimNextAgentRun, processAgentRun } from "../../worker/agent-runner";
import { claimNextRun, processRun } from "../../worker/runner";
import { connectAi, fakeKey, MODEL_PROVIDER_ENV_KEYS, useAiDouble } from "./ai-helpers";
import { addMember, claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prevEnv = { ...process.env };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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

interface Actor {
  user: CurrentUser;
  cookie: string;
}
async function signIn(user: CurrentUser): Promise<Actor> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const c = await ssoSessionCookie(session.token);
  return { user, cookie: `${c.name}=${encodeURIComponent(c.value)}` };
}
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(actor: Actor, handler: unknown, method: string, params: Record<string, string>, body?: unknown) {
  sessionHolder.headers = new Headers({ cookie: actor.cookie });
  const res = await (handler as Handler)(new Request("http://localhost:3100/api/x", { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) }), { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, text, body: text ? (JSON.parse(text) as Record<string, unknown>) : null, headers: res.headers };
}

const node = (id: string, type: FlowNode["type"], config: Record<string, unknown>, x = 0): FlowNode => ({ id, type, position: { x, y: 0 }, data: { label: id, config: config as never } });
const aiGraph = (cfg: Record<string, unknown> = {}): FlowGraph => ({
  nodes: [node("t", "trigger.manual", { samplePayload: '{"t":"Priority: high. Customer is angry"}' }), node("g", "ai.generate", { instructions: "Summarise", source: "t", maxTokens: 100, model: "", ...cfg }, 200), node("o", "output", { key: "r", expression: "" }, 400)],
  edges: [
    { id: "e1", source: "t", target: "g" },
    { id: "e2", source: "g", target: "o" },
  ],
});

async function tenant(name: string, opts: { connect?: boolean; key?: string; allowUnknownCost?: boolean; useRoles?: string[] } = {}) {
  const owner = await makeUser(`${name}-own`);
  const ws = await createWorkspace(owner, unique(name));
  const conn = opts.connect === false ? null : await connectAi(owner, ws.id, { key: opts.key, allowUnknownCost: opts.allowUnknownCost, useRoles: opts.useRoles });
  return { owner, ws, conn: conn?.connection ?? null, key: conn?.key ?? null };
}
async function aiFlow(user: CurrentUser, wsId: string, cfg: Record<string, unknown> = {}) {
  const flow = await createFlow(user, wsId, { name: unique("AI") });
  await saveFlow(user, flow.id, { baseRevision: 1, graph: aiGraph(cfg) });
  return flow;
}
async function runFlow(user: CurrentUser, flowId: string) {
  const r = await enqueueRun(user, flowId);
  await claimAndProcess(r.id);
  return freshRun(r.id);
}
const step = async (runId: string, nodeId = "g") => (await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId))))[0]!;
const fakeRequests = async () => ((await (await fetch(`${ai.url}/__fake/openai/requests`)).json()) as { requests: { path: string; keySha256: string | null; model?: string }[]; stolen: number });
const chatCalls = async () => (await fakeRequests()).requests.filter((r) => r.path.endsWith("/chat/completions"));
const fault = (f: Record<string, unknown>) => fetch(`${ai.url}/__fake/openai/fault`, { method: "POST", body: JSON.stringify(f) });
const catalogue = (c: Record<string, unknown>) => fetch(`${ai.url}/__fake/openai/catalogue`, { method: "POST", body: JSON.stringify(c) });

/* ───────── tests ───────── */

describe("no model-provider env keys; no fallback", () => {
  it("the app runs non-AI work with no AI key; AI steps without a connection fail clearly (AI_NOT_CONFIGURED)", async () => {
    for (const k of MODEL_PROVIDER_ENV_KEYS) expect(process.env[k], k).toBeUndefined();
    const { owner, ws } = await tenant("NoKey", { connect: false });
    const plain = await createFlow(owner, ws.id, { name: unique("Plain") });
    await saveFlow(owner, plain.id, { baseRevision: 1, graph: { nodes: [node("t", "trigger.manual", { samplePayload: '{"n":2}' }), node("x", "transform.json", { expression: '{"v": n * 2}' }, 200)], edges: [{ id: "e", source: "t", target: "x" }] } });
    expect((await runFlow(owner, plain.id)).status).toBe("succeeded");
    const run = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(run.status).toBe("failed");
    expect(run.error?.code).toBe("AI_NOT_CONFIGURED");
    expect(await chatCalls()).toHaveLength(0);
  });

  it("bogus global env keys are never sent: not when unconfigured, not after a disconnect", async () => {
    const globalKey = fakeKey("GLOBAL-ENV");
    Object.assign(process.env, { OPENAI_API_KEY: globalKey, FLOWLINE_AI_PROVIDER: "openai", FLOWLINE_AI_MODEL: "fake-gpt-mini", ANTHROPIC_API_KEY: globalKey, OLLAMA_BASE_URL: ai.url });
    const a = await tenant("EnvA", { connect: false });
    expect((await runFlow(a.owner, (await aiFlow(a.owner, a.ws.id)).id)).error?.code).toBe("AI_NOT_CONFIGURED");
    const b = await tenant("EnvB");
    const flow = await aiFlow(b.owner, b.ws.id);
    expect((await runFlow(b.owner, flow.id)).status).toBe("succeeded");
    await disconnectAiConnection(db, await getAiConnection(db, b.ws.id, b.conn!.id));
    expect((await runFlow(b.owner, flow.id)).error?.code).toBe("AI_CONNECTION_REVOKED");
    const hashes = (await fakeRequests()).requests.map((r) => r.keySha256);
    expect(hashes).not.toContain(sha(globalKey));
    expect(hashes.every((h) => h === sha(b.key!))).toBe(true);
  });
});

describe("workspace isolation", () => {
  it("same provider, different keys: each workspace's runs use its own key; the other workspace can't see or use it", async () => {
    const A = await tenant("IsoA");
    const B = await tenant("IsoB");
    const ra = await runFlow(A.owner, (await aiFlow(A.owner, A.ws.id)).id);
    const rb = await runFlow(B.owner, (await aiFlow(B.owner, B.ws.id)).id);
    expect([ra.status, rb.status]).toEqual(["succeeded", "succeeded"]);
    const hashes = (await chatCalls()).map((r) => r.keySha256);
    expect(hashes).toEqual([sha(A.key!), sha(B.key!)]);

    // API: B's owner gets 404 for A's connection, whichever workspace id is used.
    const bo = await signIn(B.owner);
    expect((await call(bo, aiConnGET, "GET", { wid: B.ws.id, cid: A.conn!.id })).status).toBe(404);
    expect((await call(bo, aiConnGET, "GET", { wid: A.ws.id, cid: A.conn!.id })).status).toBe(404);
    expect((await call(bo, aiConnsGET, "GET", { wid: A.ws.id })).status).toBe(404);
    const models = (await call(bo, aiModelsGET, "GET", { wid: B.ws.id })).body!.models as { connectionId: string }[];
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.connectionId === B.conn!.id)).toBe(true);
    // Selection: B can't pin A's connection…
    const f = await createFlow(B.owner, B.ws.id, { name: unique("Steal") });
    await expectHttpError(saveFlow(B.owner, f.id, { baseRevision: 1, graph: aiGraph({ route: { connectionId: A.conn!.id, modelId: "fake-gpt-mini" } }) }), 422, "AI_CONNECTION_MISSING");
    // …and execution refuses it even if it got into a graph.
    const [bws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, B.ws.id));
    await expect(resolveRoute(db, bws!, { pin: { connectionId: A.conn!.id, modelId: "fake-gpt-mini" } })).rejects.toMatchObject({ code: "AI_CONNECTION_MISSING" });
  });
});

describe("permissions: manage ≠ use; checked at selection AND execution", () => {
  it("connecting doesn't grant members; use_roles gates the picker, saving and running; a change after enqueue is honoured", async () => {
    const { ws, conn } = await tenant("Perm");
    const editor = await makeUser("perm-ed");
    const viewer = await makeUser("perm-vw");
    await addMember(ws.id, editor.id, "editor");
    await addMember(ws.id, viewer.id, "viewer");
    const ed = await signIn(editor);
    const vw = await signIn(viewer);
    // manage (owner only), server-side
    expect((await call(ed, aiConnsPOST, "POST", { wid: ws.id }, { provider: "openai", label: "x", apiKey: fakeKey() })).status).toBe(403);
    expect((await call(ed, aiConnPATCH, "PATCH", { wid: ws.id, cid: conn!.id }, { useRoles: ["owner", "editor"] })).status).toBe(403);
    expect((await call(vw, aiModelsGET, "GET", { wid: ws.id })).status).toBe(403);
    // use: default use_roles = ["owner"] → the editor sees no models and can't pin the route
    expect((await call(ed, aiModelsGET, "GET", { wid: ws.id })).body!.models).toEqual([]);
    const f = await createFlow(editor, ws.id, { name: unique("Ed") });
    await expectHttpError(saveFlow(editor, f.id, { baseRevision: 1, graph: aiGraph({ route: { connectionId: conn!.id, modelId: "fake-gpt-mini" } }) }), 403, "AI_ROUTE_FORBIDDEN");
    // …nor run through the default
    await saveFlow(editor, f.id, { baseRevision: 1, graph: aiGraph() });
    expect((await runFlow(editor, f.id)).error?.code).toBe("AI_ROUTE_FORBIDDEN");
    // Owner allows editors → it works
    await setUseRoles(db, await getAiConnection(db, ws.id, conn!.id), ["owner", "editor"]);
    expect(((await call(ed, aiModelsGET, "GET", { wid: ws.id })).body!.models as unknown[]).length).toBe(5);
    expect((await runFlow(editor, f.id)).status).toBe("succeeded");
    // Enqueued while allowed, access removed before execution → refused at execution, nothing sent
    const before = (await chatCalls()).length;
    const queued = await enqueueRun(editor, f.id);
    await setUseRoles(db, await getAiConnection(db, ws.id, conn!.id), ["owner"]);
    await claimAndProcess(queued.id);
    expect((await freshRun(queued.id)).error?.code).toBe("AI_ROUTE_FORBIDDEN");
    expect((await chatCalls()).length).toBe(before);
    const refused = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.runId, queued.id));
    expect(refused.map((a) => [a.outcome, a.errorCode])).toEqual([["refused", "AI_ROUTE_FORBIDDEN"]]);
  });
});

describe("secrets never leave the server", () => {
  it("a canary key appears in no API response, log line, run record, usage/attempt row or audit entry", async () => {
    const canary = `sk-fake-CANARY${randomUUID().replace(/-/g, "")}`;
    const owner = await makeUser("canary");
    const ws = await createWorkspace(owner, unique("Canary"));
    const o = await signIn(owner);
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" "))));
    try {
      const bodies: string[] = [];
      const created = await call(o, aiConnsPOST, "POST", { wid: ws.id }, { provider: "openai", label: "Canary", apiKey: canary });
      expect(created.status).toBe(201);
      expect(created.headers.get("cache-control")).toBe("no-store");
      const cid = (created.body!.connection as { id: string; keyHint: string }).id;
      expect((created.body!.connection as { keyHint: string }).keyHint).toBe(`••••${canary.slice(-4)}`);
      bodies.push(created.text);
      await db.update(schema.workspace).set({ aiDefaultRoute: { connectionId: cid, modelId: "fake-gpt-mini" }, aiPolicy: { mode: "MANUAL", allowUnknownCost: true } }).where(eq(schema.workspace.id, ws.id));
      for (const [h, p] of [
        [aiOverviewGET, { wid: ws.id }],
        [aiConnsGET, { wid: ws.id }],
        [aiConnGET, { wid: ws.id, cid }],
        [aiModelsGET, { wid: ws.id }],
        [aiAffectedGET, { wid: ws.id, cid }],
      ] as const) {
        const r = await call(o, h, "GET", p);
        expect(r.status).toBe(200);
        bodies.push(r.text);
      }
      bodies.push((await call(o, aiTestPOST, "POST", { wid: ws.id, cid }, { kind: "metadata" })).text);
      // A rejected key: the error names no key material either.
      const rejectedKey = `sk-fake-revoked-CANARY${randomUUID().slice(0, 8)}`;
      const rej = await call(o, aiConnsPOST, "POST", { wid: ws.id }, { provider: "openai", label: "Bad", apiKey: rejectedKey });
      expect([rej.status, (rej.body!.error as { code: string }).code]).toEqual([400, "AI_KEY_REJECTED"]);
      bodies.push(rej.text);
      // Runs: success + a provider 401 during a run (the double echoes part of the key in its error body).
      const flow = await aiFlow(owner, ws.id);
      const ok = await runFlow(owner, flow.id);
      expect(ok.status).toBe("succeeded");
      await fault({ mode: "401", times: 1 });
      const bad = await runFlow(owner, flow.id);
      expect(bad.error?.code).toBe("AI_AUTH_FAILED");
      const persisted = JSON.stringify([
        await db.select().from(schema.runStep).where(eq(schema.runStep.runId, ok.id)),
        await db.select().from(schema.runStep).where(eq(schema.runStep.runId, bad.id)),
        await db.select().from(schema.run).where(eq(schema.run.id, bad.id)),
        await db.select().from(schema.runEvent).where(eq(schema.runEvent.workspaceId, ws.id)),
        await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.workspaceId, ws.id)),
        await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.workspaceId, ws.id)),
        await db.select().from(schema.aiConnection).where(eq(schema.aiConnection.workspaceId, ws.id)),
        await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.workspaceId, ws.id)),
      ]);
      const everything = [...bodies, persisted, ...logs].join("\n");
      for (const needle of [canary, canary.slice(8, 30), rejectedKey, rejectedKey.slice(0, 20)]) expect(everything).not.toContain(needle);
      expect(persisted).not.toContain("HIDDEN-CHAIN-OF-THOUGHT");
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe("discovery", () => {
  it("a malformed catalogue keeps the last valid snapshot (stale); a removed model gives an actionable error", async () => {
    const { owner, ws, conn } = await tenant("Cat");
    const c = () => getAiConnection(db, ws.id, conn!.id);
    const rows = () => db.select().from(schema.aiConnectionModel).where(eq(schema.aiConnectionModel.connectionId, conn!.id));
    expect((await rows()).filter((r) => !r.removedAt)).toHaveLength(5);
    await catalogue({ mode: "malformed" });
    expect(await refreshCatalogue(db, await c())).toMatchObject({ ok: false, code: "AI_CATALOGUE_MALFORMED" });
    expect((await rows()).filter((r) => !r.removedAt)).toHaveLength(5);
    expect(await c()).toMatchObject({ catalogStale: true });
    expect((await c()).catalogError).toContain("AI_CATALOGUE_MALFORMED");
    await catalogue({ mode: "outage" });
    expect(await refreshCatalogue(db, await c())).toMatchObject({ ok: false });
    expect((await rows()).filter((r) => !r.removedAt)).toHaveLength(5);

    // The provider drops a model: refresh marks it removed; a step pinned to it fails with an actionable error.
    const flow = await aiFlow(owner, ws.id, { route: { connectionId: conn!.id, modelId: "fake-gpt-large" } });
    await catalogue({ mode: "normal", remove: "fake-gpt-large" });
    expect(await refreshCatalogue(db, await c())).toMatchObject({ ok: true, count: 4 });
    expect(await c()).toMatchObject({ catalogStale: false, catalogError: null });
    const run = await runFlow(owner, flow.id);
    expect(run.error?.code).toBe("AI_MODEL_REMOVED");
    expect(run.error?.message).toMatch(/fake-gpt-large .*Pick another model/);
    expect(await chatCalls()).toHaveLength(0);

    // A model that disappears between refreshes: the provider's 404 is mapped and the model is marked removed.
    const flow2 = await aiFlow(owner, ws.id, { route: { connectionId: conn!.id, modelId: "fake-gpt-tools" } });
    await fault({ mode: "removed_model", times: 1 });
    expect((await runFlow(owner, flow2.id)).error?.code).toBe("AI_MODEL_REMOVED");
    expect((await rows()).find((r) => r.modelId === "fake-gpt-tools")!.removedAt).not.toBeNull();
  });
});

describe("cost policy and usage records", () => {
  it("unknown price under a hard cap is refused before sending; a known price reserves a defensible max and settles; allowed unknown stays unknown", async () => {
    const { owner, ws } = await tenant("Cost", { allowUnknownCost: false });
    await updateWorkspace(ws.id, { monthlyBudget: 50 });
    const flow = await aiFlow(owner, ws.id);
    const refused = await runFlow(owner, flow.id);
    expect(refused.error?.code).toBe("AI_COST_UNKNOWN");
    expect(await chatCalls()).toHaveLength(0);

    await updateWorkspace(ws.id, { prices: { "ai:openai/fake-gpt-mini": { inputPerMTok: 1, outputPerMTok: 4 } } });
    const priced = await runFlow(owner, flow.id);
    expect(priced.status).toBe("succeeded");
    const s = await step(priced.id);
    expect(s.meta).toMatchObject({ provider: "openai", model: "fake-gpt-mini", costSource: "estimated", unpriced: false });
    const [att] = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.runId, priced.id));
    const [ue] = await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.idempotencyKey, att!.usageKey!));
    expect(att).toMatchObject({ outcome: "success", provider: "openai", modelId: "fake-gpt-mini", protocol: "openai-chat", costSource: "estimated", attempt: 1, connectionId: expect.any(String) });
    expect(att!.inputTokens! + att!.outputTokens!).toBeGreaterThan(0);
    expect(ue).toMatchObject({ status: "settled", kind: "ai", costMicros: att!.costMicros, unpriced: false });
    expect(ue!.estimatedMicros!).toBeGreaterThanOrEqual(att!.costMicros!); // the reservation bounded the real cost
    expect((s.meta as { costMicros: number }).costMicros).toBe(att!.costMicros);

    await updateWorkspace(ws.id, { prices: {} });
    await db.update(schema.workspace).set({ aiPolicy: { mode: "MANUAL", allowUnknownCost: true } }).where(eq(schema.workspace.id, ws.id));
    const unknown = await runFlow(owner, flow.id);
    expect(unknown.status).toBe("succeeded");
    expect((await step(unknown.id)).meta).toMatchObject({ costMicros: null, costSource: "unknown", unpriced: true });
    const [ua] = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.runId, unknown.id));
    expect(ua).toMatchObject({ costMicros: null, costSource: "unknown" });
  });

  it("429 with Retry-After is retried as separate attempts; each attempt has its own row and ledger entry", async () => {
    const { owner, ws } = await tenant("Retry");
    await fault({ mode: "429", times: 1, retryAfterSec: 0 });
    const run = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(run.status).toBe("succeeded");
    const atts = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.runId, run.id));
    expect(atts.map((a) => [a.attempt, a.outcome, a.errorCode]).sort()).toEqual([
      [1, "error", "AI_RATE_LIMITED"],
      [2, "success", null],
    ]);
    const ledger = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.runId, run.id), eq(schema.usageEvent.kind, "ai")));
    expect(ledger.map((u) => u.status).sort()).toEqual(["released", "settled"]);
  });
});

describe("legacy local configuration", () => {
  it("is preserved, listed for migration, and refused at execution with AI_LOCAL_MIGRATION_REQUIRED — never converted", async () => {
    // Agent runs other files left queued in this database would be claimed by the loop below and call the AI double;
    // process them first so the "no chat call" assertion is about this test only (order-independent, shard-safe).
    for (let i = 0; i < 200; i++) {
      const id = await claimNextAgentRun(db, "w-legacy-pre");
      if (!id) break;
      await processAgentRun(db, id, "w-legacy-pre");
    }
    await fetch(`${ai.url}/__fake/reset`, { method: "POST" });
    const { owner, ws } = await tenant("Legacy", { connect: false });
    await db.update(schema.workspace).set({ aiProvider: "ollama", aiModel: "qwen2.5:3b" }).where(eq(schema.workspace.id, ws.id));
    const flow = await aiFlow(owner, ws.id, { model: "qwen2.5:3b" });
    const r1 = await runFlow(owner, flow.id);
    expect(r1.error?.code).toBe("AI_LOCAL_MIGRATION_REQUIRED");
    // Even once a cloud default exists, a step naming an Ollama model is not reinterpreted on it.
    await connectAi(owner, ws.id);
    expect((await runFlow(owner, flow.id)).error?.code).toBe("AI_LOCAL_MIGRATION_REQUIRED");
    // An agent version pinned to Ollama.
    const agent = await createAgent(owner, ws.id, { name: "Old", instructions: "x", tools: [], limits: { maxSteps: 3, maxToolCalls: 3, maxCostMicros: null, timeoutMs: 20_000 } });
    const [a] = await db.select().from(schema.agent).where(eq(schema.agent.id, agent.id));
    await db.update(schema.agentVersion).set({ provider: "ollama", model: "qwen2.5:3b" }).where(eq(schema.agentVersion.id, a!.currentVersionId!));
    const ar = await startAgentRun({ agentId: agent.id, message: "hi", actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } });
    for (let i = 0; i < 200; i++) {
      const id = await claimNextAgentRun(db, "w-legacy");
      if (!id) break;
      await processAgentRun(db, id, "w-legacy");
      if (id === ar.id) break;
    }
    const [done] = await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, ar.id));
    expect(done!.error).toMatchObject({ code: "AI_LOCAL_MIGRATION_REQUIRED" });
    const report = await legacyReport(db, ws.id);
    expect(report.workspaceDefault).toEqual({ provider: "ollama", model: "qwen2.5:3b" });
    expect(report.agents.map((x) => x.id)).toContain(agent.id);
    expect(report.flows.map((x) => x.id)).toContain(flow.id);
    const [after] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws.id));
    expect([after!.aiProvider, after!.aiModel]).toEqual(["ollama", "qwen2.5:3b"]); // preserved, not converted
    expect(await chatCalls()).toHaveLength(0);
  });
});

describe("replace and disconnect", () => {
  it("queued work picks up a replaced key; disconnect fails clearly; stale replacements conflict", async () => {
    const { owner, ws, conn, key } = await tenant("Rotate");
    const flow = await aiFlow(owner, ws.id);
    const queued = await enqueueRun(owner, flow.id);
    const stale = await getAiConnection(db, ws.id, conn!.id);
    const newKey = fakeKey("rotated");
    await replaceAiKey(db, stale, newKey);
    await claimAndProcess(queued.id);
    expect((await freshRun(queued.id)).status).toBe("succeeded");
    expect((await chatCalls()).map((r) => r.keySha256)).toEqual([sha(newKey)]);
    expect((await chatCalls()).map((r) => r.keySha256)).not.toContain(sha(key!));
    // A replacement based on an old read of the connection conflicts instead of overwriting.
    await expectHttpError(replaceAiKey(db, stale, fakeKey("late")), 409, "AI_CONNECTION_CHANGED");
    const current = await getAiConnection(db, ws.id, conn!.id);
    expect(current.credVersion).toBe(stale.credVersion + 1);

    const queued2 = await enqueueRun(owner, flow.id);
    await disconnectAiConnection(db, current);
    const revoked = await getAiConnection(db, ws.id, conn!.id);
    expect(revoked).toMatchObject({ status: "REVOKED", secretEnc: null, keyHint: null, credVersion: current.credVersion + 1 });
    await claimAndProcess(queued2.id);
    expect((await freshRun(queued2.id)).error?.code).toBe("AI_CONNECTION_REVOKED");
    expect(await chatCalls()).toHaveLength(1);
  });

  it("a disconnect while a call is in flight discards its answer (fenced by cred_version); no fallback", async () => {
    const { owner, ws, conn } = await tenant("Fence");
    const [w] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws.id));
    const route = await resolveRoute(db, w!, {});
    await fault({ mode: "slow", times: 1, delayMs: 800 });
    const inflight = executeAi(db, { workspace: w!, actorUserId: owner.id, route, request: { system: "s", messages: [{ role: "user", content: "hello" }], maxTokens: 20 }, purpose: "node", metering: "hub", requestId: `fence:${randomUUID()}`, signal: AbortSignal.timeout(10_000) });
    await new Promise((r) => setTimeout(r, 200));
    await disconnectAiConnection(db, await getAiConnection(db, ws.id, conn!.id));
    await expect(inflight).rejects.toMatchObject({ code: "AI_CONNECTION_REVOKED" });
    const atts = await db.select().from(schema.aiAttempt).where(eq(schema.aiAttempt.connectionId, conn!.id));
    expect(atts.map((a) => [a.outcome, a.errorCode])).toEqual([["error", "AI_CONNECTION_REVOKED"]]);
  });
});

describe("snapshots and persistence", () => {
  it("publish pins the default route into the published version; the draft keeps following the default", async () => {
    const { owner, ws, conn } = await tenant("Snap");
    const flow = await aiFlow(owner, ws.id);
    await publishFlow(owner, flow.id);
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    const [v] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, f!.publishedVersionId!));
    const cfg = (g: FlowGraph) => g.nodes.find((n) => n.id === "g")!.data.config as { route?: unknown };
    expect(cfg(v!.graph as FlowGraph).route).toEqual({ connectionId: conn!.id, modelId: "fake-gpt-mini" });
    expect(cfg(f!.graph as FlowGraph).route).toBeUndefined();
    const run = await runFlow(owner, flow.id);
    expect((await step(run.id)).meta).toMatchObject({ connectionId: conn!.id, routeSource: "workspace-default", protocol: "openai-chat" });
  });

  it("a restarted worker (a NEW process) runs queued AI work with the stored connection — no key re-entry, no cache", async () => {
    const { owner, ws, key } = await tenant("Restart");
    const flow = await aiFlow(owner, ws.id);
    const r = await enqueueRun(owner, flow.id);
    const env = { ...process.env };
    for (const k of MODEL_PROVIDER_ENV_KEYS) delete env[k];
    // Async: the provider double lives in THIS process and must keep answering while the child worker runs.
    await promisify(execFile)(process.execPath, [join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), "tests/fixtures/process-run.ts", r.id], { env, timeout: 90_000 });
    expect((await freshRun(r.id)).status).toBe("succeeded");
    expect((await chatCalls()).map((c) => c.keySha256)).toEqual([sha(key!)]);
  }, 120_000);
});

describe("rate limits on key operations", () => {
  it("connection tests are limited per connection", async () => {
    const { owner, ws, conn } = await tenant("Rate");
    const o = await signIn(owner);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await call(o, aiTestPOST, "POST", { wid: ws.id, cid: conn!.id }, { kind: "metadata" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
