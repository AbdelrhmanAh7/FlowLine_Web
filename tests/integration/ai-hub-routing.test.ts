/**
 * AI provider hub (Wave B) — integration: every protocol through a real workflow step, provider-specific connection
 * rules, routing policies (MANUAL / FALLBACK / FREE_ONLY / LOW_COST + privacy) with visible route meta, the circuit
 * breaker, budgets (defensible reservation, concurrent reservations, possible charges), streaming + cancellation (no
 * concatenation across attempts), agents and Copilot on the hub (route pins, snapshots, metering, no tool replay),
 * gateway visibility (serving provider, provider-reported cost). Provider = the protocol-accurate TEST DOUBLE.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => {
    throw new Error("cookies() is not used by API routes");
  },
}));

import { PUT as policyPUT } from "@/app/api/workspaces/[wid]/ai/policy/route";
import { GET as aiModelsGET } from "@/app/api/workspaces/[wid]/ai/models/route";
import { createAiConnection, disconnectAiConnection, getAiConnection, inferenceTest, replaceAiKey, setDefaultRoute, setUseRoles, testAiConnection } from "@/ai/hub/connections";
import { BREAKER, executeAi } from "@/ai/hub/execute";
import { resolveRoute } from "@/ai/hub/routing";
import type { StreamEvent } from "@/ai/hub/types";
import { db, schema } from "@/db";
import type { AiPolicy, AiRouteRef } from "@/db/schema";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/server/access";
import { createAgent, startAgentRun } from "@/server/agents";
import { propose } from "@/server/copilot";
import { createFlow, saveFlow } from "@/server/flows";
import { addSource, indexNextSource } from "@/server/knowledge";
import { enqueueRun } from "@/server/runs";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { claimNextAgentRun, processAgentRun } from "../../worker/agent-runner";
import { claimNextRun, processRun } from "../../worker/runner";
import { fakeKey, MODEL_PROVIDER_ENV_KEYS, useAiDouble } from "./ai-helpers";
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

const post = (path: string, body: unknown) => fetch(`${ai.url}${path}`, { method: "POST", body: JSON.stringify(body) });
const hubFault = (f: Record<string, unknown>) => post("/__fake/hub/fault", { times: 1, ...f });
const oaFault = (f: Record<string, unknown>) => post("/__fake/openai/fault", f);
type HubReq = { provider: string; method: string; path: string; keySha256: string | null; body: Record<string, unknown> | null };
const hubCalls = async (provider?: string) => ((await (await fetch(`${ai.url}/__fake/hub/requests`)).json()) as { requests: HubReq[] }).requests.filter((r) => r.method === "POST" && (!provider || r.provider === provider));

async function tenant(name: string) {
  const owner = await makeUser(`${name}-own`);
  const ws = await createWorkspace(owner, unique(name));
  // The test billing plans carry a usage cap: the double's models are mostly unpriced, so the owner allows unknown cost.
  await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true });
  return { owner, ws };
}
async function connect(owner: CurrentUser, wsId: string, provider: string, opts: { settings?: Record<string, string>; key?: string; label?: string } = {}) {
  const key = opts.key ?? fakeKey(provider);
  const c = await createAiConnection(db, owner.id, wsId, { provider, label: opts.label ?? provider, apiKey: key, settings: opts.settings, attestPayAsYouGo: true });
  return { ...c, key };
}
const ref = (c: { id: string }, modelId: string): AiRouteRef => ({ connectionId: c.id, modelId });
const setPolicy = (wsId: string, p: AiPolicy) => db.update(schema.workspace).set({ aiPolicy: p }).where(eq(schema.workspace.id, wsId));
const wsRow = async (id: string) => (await db.select().from(schema.workspace).where(eq(schema.workspace.id, id)))[0]!;
const attempts = (where: { runId?: string; requestId?: string; agentRunId?: string }) =>
  db
    .select()
    .from(schema.aiAttempt)
    .where(where.runId ? eq(schema.aiAttempt.runId, where.runId) : where.agentRunId ? eq(schema.aiAttempt.agentRunId, where.agentRunId) : eq(schema.aiAttempt.requestId, where.requestId!))
    .orderBy(schema.aiAttempt.id);

const node = (id: string, type: FlowNode["type"], config: Record<string, unknown>, x = 0): FlowNode => ({ id, type, position: { x, y: 0 }, data: { label: id, config: config as never } });
const aiGraph = (cfg: Record<string, unknown> = {}, type: FlowNode["type"] = "ai.generate"): FlowGraph => ({
  nodes: [node("t", "trigger.manual", { samplePayload: '{"t":"Priority: high. Customer is angry"}' }), node("g", type, { instructions: "Summarise", source: "t", maxTokens: 100, model: "", ...cfg }, 200), node("o", "output", { key: "r", expression: "" }, 400)],
  edges: [
    { id: "e1", source: "t", target: "g" },
    { id: "e2", source: "g", target: "o" },
  ],
});
async function aiFlow(user: CurrentUser, wsId: string, cfg: Record<string, unknown> = {}, type: FlowNode["type"] = "ai.generate") {
  const flow = await createFlow(user, wsId, { name: unique("AI") });
  await saveFlow(user, flow.id, { baseRevision: 1, graph: aiGraph(cfg, type) });
  return flow;
}
async function runFlow(user: CurrentUser, flowId: string) {
  const r = await enqueueRun(user, flowId);
  await claimAndProcess(r.id);
  return freshRun(r.id);
}
/** The error code a rejected call ends with (null when it resolved). */
const errCode = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? null);
const step = async (runId: string, nodeId = "g") => (await db.select().from(schema.runStep).where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId))))[0]!;

async function exec(wsId: string, actor: CurrentUser, route: AiRouteRef, extra: Partial<Parameters<typeof executeAi>[1]> = {}) {
  const w = await wsRow(wsId);
  return executeAi(db, {
    workspace: w,
    actorUserId: actor.id,
    route: await resolveRoute(db, w, { pin: route }),
    request: { system: "Summarise.", messages: [{ role: "user", content: "<untrusted_content>\nPriority: high\n</untrusted_content>" }], maxTokens: 50 },
    purpose: "node",
    metering: "hub",
    requestId: `t:${randomUUID()}`,
    signal: AbortSignal.timeout(20_000),
    ...extra,
  });
}

async function signIn(user: CurrentUser) {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const c = await ssoSessionCookie(session.token);
  return `${c.name}=${encodeURIComponent(c.value)}`;
}
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(cookie: string, handler: unknown, method: string, params: Record<string, string>, body?: unknown) {
  sessionHolder.headers = new Headers({ cookie });
  const res = await (handler as Handler)(new Request("http://localhost:3100/api/x", { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) }), { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

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
async function knowledgeSource(owner: CurrentUser, wsId: string) {
  const s = await addSource(db, owner, wsId, { name: unique("kb"), kind: "text", mime: "text/plain", bytes: Buffer.from("Refunds: within 30 days of purchase.") });
  while (await indexNextSource(db, unique("i"))) {
    /* index */
  }
  return s;
}
const limits = { maxSteps: 6, maxToolCalls: 4, maxCostMicros: null, timeoutMs: 20_000 };

/* ───────── every protocol through a workflow step ───────── */

describe("every protocol end-to-end through an AI step", () => {
  const cases: [string, string, Record<string, string> | undefined, string][] = [
    ["anthropic", "fake-claude", undefined, "anthropic-messages"],
    ["gemini", "fake-gemini", undefined, "gemini"],
    ["cohere", "fake-command", undefined, "cohere-v2"],
    ["xai", "fake-gpt-mini", undefined, "openai-responses"],
    ["zai", "glm-4.5-flash", undefined, "openai-chat"],
    ["dashscope", "qwen3.8-flash", { region: "ap-southeast-1", workspaceId: "ws-it-1" }, "openai-chat"],
    ["openrouter", "openai/fake-gpt-mini", undefined, "openai-chat"],
  ];
  it.each(cases)("%s: connect → discover → run a generate + an extract step, metered with the route recorded", async (provider, model, settings, protocol) => {
    const { owner, ws } = await tenant(`E2E-${provider}`);
    const c = await connect(owner, ws.id, provider, { settings });
    await setDefaultRoute(db, ws.id, ref(c, model));
    const gen = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(gen.status, JSON.stringify(gen.error)).toBe("succeeded");
    expect((await step(gen.id)).output).toMatchObject({ text: expect.stringContaining("Summary:") });
    expect((await step(gen.id)).meta).toMatchObject({ provider, protocol, policy: "MANUAL", routeReason: "primary", connectionId: c.id });
    const ext = await runFlow(owner, (await aiFlow(owner, ws.id, { schema: JSON.stringify({ type: "object", properties: { priority: { type: "string" } }, required: ["priority"] }) }, "ai.extract")).id);
    expect(ext.status, JSON.stringify(ext.error)).toBe("succeeded");
    expect((await step(ext.id)).output).toEqual({ priority: expect.stringMatching(/^high/) });
    const [a] = await attempts({ runId: gen.id });
    expect(a).toMatchObject({ provider, protocol, outcome: "success", policy: "MANUAL", routeReason: "primary", possibleCharge: false });
    const ledger = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.runId, gen.id), eq(schema.usageEvent.kind, "ai")));
    expect(ledger.map((u) => u.status)).toEqual(["settled"]);
  });
});

/* ───────── connections: provider fields, attestation, key checks, hints, catalogue ───────── */

describe("provider-specific connection rules", () => {
  it("required fields are validated; coding-plan-restricted providers need the pay-as-you-go attestation; nothing is sent otherwise", async () => {
    const { owner, ws } = await tenant("Fields");
    await expectHttpError(createAiConnection(db, owner.id, ws.id, { provider: "dashscope", label: "a", apiKey: fakeKey(), attestPayAsYouGo: true }), 400, "AI_SETTINGS_INVALID");
    await expectHttpError(createAiConnection(db, owner.id, ws.id, { provider: "dashscope", label: "a", apiKey: fakeKey(), settings: { region: "ap-southeast-1", workspaceId: "x.evil.com" }, attestPayAsYouGo: true }), 400, "AI_SETTINGS_INVALID");
    await expectHttpError(createAiConnection(db, owner.id, ws.id, { provider: "zai", label: "z", apiKey: fakeKey() }), 422, "AI_PLAN_ATTESTATION_REQUIRED");
    await expectHttpError(createAiConnection(db, owner.id, ws.id, { provider: "openai", label: "o", apiKey: fakeKey(), settings: { baseUrl: "https://proxy.example" } }), 400, "AI_CUSTOM_ENDPOINT_NOT_APPROVED");
    await expectHttpError(createAiConnection(db, owner.id, ws.id, { provider: "opencode-zen", label: "o", apiKey: fakeKey() }), 422, "AI_PROVIDER_NOT_AVAILABLE");
    expect(await hubCalls()).toEqual([]);
  });

  it("static-catalogue providers can't have their key checked by listing: said so; the disclosed inference test confirms it", async () => {
    const { owner, ws } = await tenant("Static");
    const c = await connect(owner, ws.id, "zai");
    expect(c).toMatchObject({ keyCheck: "none", lastTestedAt: null, status: "CONNECTED" });
    expect(c.models.discovered).toBeGreaterThan(3);
    const t = await testAiConnection(db, await getAiConnection(db, ws.id, c.id));
    expect(t).toMatchObject({ ok: false, code: "AI_KEY_NOT_CHECKABLE" });
    const inf = await inferenceTest(db, owner.id, await wsRow(ws.id), await getAiConnection(db, ws.id, c.id), "glm-4.5-flash");
    expect(inf.ok).toBe(true);
    expect((await getAiConnection(db, ws.id, c.id)).lastTestedAt).not.toBeNull();
  });

  it("key hint: last 4 only for keys of 32+ characters; shorter keys show only the date they were set", async () => {
    const { owner, ws } = await tenant("Hint");
    const long = await connect(owner, ws.id, "openai", { key: `sk-fake-${"a".repeat(30)}WXYZ` });
    expect(long).toMatchObject({ keyHint: "••••WXYZ", keySetAt: null });
    const { key: _shortKey, ...short } = await connect(owner, ws.id, "openai", { key: "sk-fake-short-7Q9" });
    expect(short.keyHint).toBeNull();
    expect(short.keySetAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(short)).not.toContain("7Q9"); // the public connection never carries any part of a short key
  });

  it("curated prices (with source + date) and verified-zero models reach the picker; listing prices for OpenRouter", async () => {
    const { owner, ws } = await tenant("Catalogue");
    const z = await connect(owner, ws.id, "zai");
    const or = await connect(owner, ws.id, "openrouter");
    const cookie = await signIn(owner);
    const models = (await call(cookie, aiModelsGET, "GET", { wid: ws.id })).body!.models as { connectionId: string; modelId: string; price: { known: boolean; zero: boolean; sourceUrl: string | null; verifiedAt: string | null; inputPerMTokMicros: number | null }; idUnverified: boolean; capabilities: { tools: string; structuredOutput: string } }[];
    const free = models.find((m) => m.connectionId === z.id && m.modelId === "glm-4.5-flash")!;
    expect(free.price).toMatchObject({ known: true, zero: true, sourceUrl: "https://docs.z.ai/guides/overview/pricing", verifiedAt: "2026-09-29" });
    expect(free.idUnverified).toBe(true);
    const paid = models.find((m) => m.connectionId === z.id && m.modelId === "glm-5.3")!;
    expect(paid.price).toMatchObject({ known: true, zero: false, inputPerMTokMicros: 1_400_000 });
    expect(models.find((m) => m.connectionId === z.id && m.modelId === "glm-5.2")!.price.known).toBe(false); // unpriced stays unknown
    expect(paid.capabilities.structuredOutput).toBe("UNSUPPORTED"); // provider-wide documented fact
    expect(models.find((m) => m.connectionId === or.id && m.modelId === "vendor/fake-free:free")!.price).toMatchObject({ known: true, zero: true });
    expect(models.find((m) => m.connectionId === or.id && m.modelId === "openrouter/auto")!.price.known).toBe(false);
    expect(models.find((m) => m.connectionId === or.id && m.modelId === "vendor/fake-notools")!.capabilities.tools).toBe("UNSUPPORTED");
  });
});

/* ───────── routing policies ───────── */

describe("FALLBACK", () => {
  it("moves to the next explicitly listed route after the primary's bounded retries; which route + why is in step meta, attempts and events", async () => {
    const { owner, ws } = await tenant("Fallback");
    const oa = await connect(owner, ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    await setDefaultRoute(db, ws.id, ref(oa, "fake-gpt-mini"));
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(an, "fake-claude")] });
    await oaFault({ mode: "500", times: 3 });
    const run = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    const meta = (await step(run.id)).meta as Record<string, unknown>;
    expect(meta).toMatchObject({ provider: "anthropic", connectionId: an.id, policy: "FALLBACK", routeReason: "fallback #1 after AI_PROVIDER_ERROR", fallbackFrom: [{ provider: "openai", connectionId: oa.id, modelId: "fake-gpt-mini", code: "AI_PROVIDER_ERROR" }] });
    const rows = await attempts({ runId: run.id });
    expect(rows.map((a) => [a.attempt, a.provider, a.outcome, a.errorCode, a.routeReason])).toEqual([
      [1, "openai", "error", "AI_PROVIDER_ERROR", "primary"],
      [2, "openai", "error", "AI_PROVIDER_ERROR", "primary"],
      [3, "openai", "error", "AI_PROVIDER_ERROR", "primary"],
      [4, "anthropic", "success", null, "fallback #1 after AI_PROVIDER_ERROR"],
    ]);
    const ledger = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.runId, run.id), eq(schema.usageEvent.kind, "ai")));
    expect(ledger.map((u) => u.status).sort()).toEqual(["released", "released", "released", "settled"]); // one billable answer, no duplicate
    const events = await db.select().from(schema.runEvent).where(and(eq(schema.runEvent.runId, run.id), eq(schema.runEvent.type, "ai_fallback")));
    expect(events).toHaveLength(1);
  });

  it("never falls back after an auth refusal or a safety refusal; MANUAL never uses another route", async () => {
    const { owner, ws } = await tenant("NoFallback");
    const or = await connect(owner, ws.id, "openrouter");
    const an = await connect(owner, ws.id, "anthropic");
    await setDefaultRoute(db, ws.id, ref(or, "openai/fake-gpt-mini"));
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(an, "fake-claude")] });
    const flow = await aiFlow(owner, ws.id);
    await hubFault({ provider: "openrouter", mode: "http", status: 401, body: { error: { code: 401, message: "No auth credentials found" } } });
    expect((await runFlow(owner, flow.id)).error?.code).toBe("AI_AUTH_FAILED");
    await hubFault({ provider: "openrouter", mode: "http", status: 403, body: { error: { code: 403, message: "Input was flagged by moderation" } } });
    expect((await runFlow(owner, flow.id)).error?.code).toBe("AI_SAFETY_REFUSAL");
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true, fallbackRoutes: [ref(an, "fake-claude")] });
    await hubFault({ provider: "openrouter", mode: "http", status: 502, body: { error: { code: 502 } }, times: 3 });
    expect((await runFlow(owner, flow.id)).error?.code).toBe("AI_PROVIDER_ERROR");
    expect(await hubCalls("anthropic")).toEqual([]);
  });

  it("revocation mid-fallback stops the call (no further route); a key replaced mid-fallback is used at once", async () => {
    const { owner, ws } = await tenant("MidFallback");
    const oa = await connect(owner, ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    const gm = await connect(owner, ws.id, "gemini");
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(an, "fake-claude"), ref(gm, "fake-gemini")] });
    await oaFault({ mode: "500", times: 1 });
    const err = await exec(ws.id, owner, ref(oa, "fake-gpt-mini"), {
      maxAttempts: 1,
      onFallback: async ({ to }) => {
        if (to.connectionId === an.id) await disconnectAiConnection(db, await getAiConnection(db, ws.id, an.id));
      },
    }).then(
      () => null,
      (e: { code?: string }) => e,
    );
    expect(err?.code).toBe("AI_CONNECTION_REVOKED");
    expect(await hubCalls("gemini")).toEqual([]); // a revoked route is final, not a reason to try the next one

    const newKey = fakeKey("rotated");
    await oaFault({ mode: "500", times: 1 });
    const r = await exec(ws.id, owner, ref(oa, "fake-gpt-mini"), {
      maxAttempts: 1,
      policy: { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(gm, "fake-gemini")] },
      onFallback: async () => {
        await replaceAiKey(db, await getAiConnection(db, ws.id, gm.id), newKey);
      },
    });
    expect(r.route.connectionId).toBe(gm.id);
    expect((await hubCalls("gemini")).at(-1)!.keySha256).toBe(sha(newKey));
  });

  it("a listed route the acting member may not use is skipped (use_roles respected), the next one is used", async () => {
    const { owner, ws } = await tenant("FallbackRoles");
    const editor = await makeUser("fb-ed");
    await addMember(ws.id, editor.id, "editor");
    const oa = await connect(owner, ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    const gm = await connect(owner, ws.id, "gemini");
    for (const c of [oa, gm]) await setUseRoles(db, await getAiConnection(db, ws.id, c.id), ["owner", "editor"]);
    await oaFault({ mode: "500", times: 1 });
    const r = await exec(ws.id, editor, ref(oa, "fake-gpt-mini"), { maxAttempts: 1, policy: { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(an, "fake-claude"), ref(gm, "fake-gemini")] } });
    expect(r.route.connectionId).toBe(gm.id);
    expect(r.routing.fallbackFrom.map((f) => f.code)).toEqual(["AI_PROVIDER_ERROR", "AI_ROUTE_FORBIDDEN"]);
    expect(await hubCalls("anthropic")).toEqual([]);
  });
});

describe("FREE_ONLY", () => {
  it("uses only verified zero-priced routes (catalogue or documented listing); paid and unknown are refused; none → fails closed, nothing sent", async () => {
    const { owner, ws } = await tenant("Free");
    const oa = await connect(owner, ws.id, "openai");
    const z = await connect(owner, ws.id, "zai");
    const or = await connect(owner, ws.id, "openrouter");
    await setDefaultRoute(db, ws.id, ref(oa, "fake-gpt-mini"));
    await setPolicy(ws.id, { mode: "FREE_ONLY", allowUnknownCost: false, fallbackRoutes: [ref(z, "glm-5.3"), ref(or, "vendor/fake-free:free"), ref(z, "glm-4.5-flash")] });
    const run = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    const meta = (await step(run.id)).meta as { connectionId: string; routesSkipped: { modelId: string; code: string }[]; costMicros: number; costSource: string };
    expect(meta.connectionId).toBe(or.id);
    expect(meta.routesSkipped).toEqual(expect.arrayContaining([expect.objectContaining({ modelId: "fake-gpt-mini", code: "AI_NOT_FREE" }), expect.objectContaining({ modelId: "glm-5.3", code: "AI_NOT_FREE" })]));

    await setPolicy(ws.id, { mode: "FREE_ONLY", allowUnknownCost: true, fallbackRoutes: [ref(z, "glm-5.3"), ref(z, "glm-5.2")] });
    const before = (await hubCalls()).length;
    const refused = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(refused.error?.code).toBe("AI_NO_FREE_ROUTE"); // allowUnknownCost doesn't make unknown free
    expect((await hubCalls()).length).toBe(before);
  });
});

describe("LOW_COST", () => {
  it("picks the cheapest capability-compatible pool route with a KNOWN price within the ceiling; none → refused before sending", async () => {
    const { owner, ws } = await tenant("Low");
    const oa = await connect(owner, ws.id, "openai");
    const z = await connect(owner, ws.id, "zai");
    await setDefaultRoute(db, ws.id, ref(z, "glm-5.3"));
    await setPolicy(ws.id, { mode: "LOW_COST", allowUnknownCost: true, lowCostPool: [ref(oa, "fake-gpt-mini"), ref(z, "glm-5.3-flash"), ref(z, "glm-4.7-flash")], priceCeiling: { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 1_000_000 } });
    const run = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    const meta = (await step(run.id)).meta as { model: string; routeReason: string; routesSkipped: { modelId: string; code: string }[] };
    expect(meta.model).toBe("glm-4.7-flash"); // $0 < $0.15/$0.50
    expect(meta.routeReason).toMatch(/^low-cost rank 1/);
    expect(meta.routesSkipped).toEqual(expect.arrayContaining([expect.objectContaining({ modelId: "glm-5.3", code: "AI_ABOVE_PRICE_CEILING" }), expect.objectContaining({ modelId: "fake-gpt-mini", code: "AI_COST_UNKNOWN" })]));

    await setPolicy(ws.id, { mode: "LOW_COST", allowUnknownCost: true, lowCostPool: [ref(oa, "fake-gpt-mini"), ref(z, "glm-5.3")], priceCeiling: { inputPerMTokMicros: 100_000, outputPerMTokMicros: 100_000 } });
    const before = (await hubCalls()).length;
    expect((await runFlow(owner, (await aiFlow(owner, ws.id)).id)).error?.code).toBe("AI_NO_ROUTE_WITHIN_CEILING");
    expect((await hubCalls()).length).toBe(before);
  });
});

describe("privacy policy + gateway restrictions", () => {
  it("requireNoTraining refuses routes that can't guarantee it (gateways, training-by-default providers), in every mode", async () => {
    const { owner, ws } = await tenant("Privacy");
    const or = await connect(owner, ws.id, "openrouter");
    const an = await connect(owner, ws.id, "anthropic");
    await setDefaultRoute(db, ws.id, ref(or, "openai/fake-gpt-mini"));
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true, requireNoTraining: true });
    const flow = await aiFlow(owner, ws.id);
    expect((await runFlow(owner, flow.id)).error?.code).toBe("AI_PRIVACY_POLICY");
    await setPolicy(ws.id, { mode: "FALLBACK", allowUnknownCost: true, requireNoTraining: true, fallbackRoutes: [ref(an, "fake-claude")] });
    const r = await runFlow(owner, flow.id);
    expect(r.status).toBe("succeeded");
    expect((await step(r.id)).meta).toMatchObject({ provider: "anthropic", routesSkipped: [expect.objectContaining({ connectionId: or.id, code: "AI_PRIVACY_POLICY" })] });
    expect(await hubCalls("openrouter")).toEqual([]);
  });

  it("a gateway reports its serving provider and cost: both recorded (provider-reported cost)", async () => {
    const { owner, ws } = await tenant("Gateway");
    const or = await connect(owner, ws.id, "openrouter");
    await setDefaultRoute(db, ws.id, ref(or, "openai/fake-gpt-mini"));
    const r = await runFlow(owner, (await aiFlow(owner, ws.id)).id);
    expect((await step(r.id)).meta).toMatchObject({ servingProvider: "FakeUpstream", costMicros: 123, costSource: "provider_reported" });
    expect((await attempts({ runId: r.id }))[0]).toMatchObject({ servingProvider: "FakeUpstream", costSource: "provider_reported", costMicros: 123 });
  });
});

describe("circuit breaker", () => {
  it(`${BREAKER.threshold} consecutive transient failures open the connection's circuit: the next call is refused unsent; FALLBACK moves on`, async () => {
    const { owner, ws } = await tenant("Breaker");
    const oa = await connect(owner, ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    await oaFault({ mode: "500", times: BREAKER.threshold });
    expect((await errCode(exec(ws.id, owner, ref(oa, "fake-gpt-mini"))))).toBe("AI_PROVIDER_ERROR");
    const reqId = `t:${randomUUID()}`;
    expect((await errCode(exec(ws.id, owner, ref(oa, "fake-gpt-mini"), { requestId: reqId })))).toBe("AI_CIRCUIT_OPEN");
    expect((await attempts({ requestId: reqId })).map((a) => [a.outcome, a.errorCode])).toEqual([["refused", "AI_CIRCUIT_OPEN"]]);
    const r = await exec(ws.id, owner, ref(oa, "fake-gpt-mini"), { policy: { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(an, "fake-claude")] } });
    expect(r.routing.fallbackFrom).toEqual([expect.objectContaining({ code: "AI_CIRCUIT_OPEN" })]);
  });
});

/* ───────── budgets ───────── */

describe("budgets", () => {
  it("concurrent calls reserve their defensible max under one lock: only what fits the cap runs; the ledger never exceeds it", async () => {
    const { owner, ws } = await tenant("Race");
    const oa = await connect(owner, ws.id, "openai");
    await db.update(schema.workspace).set({ monthlyBudgetMicros: 150_000, prices: { "ai:openai/fake-gpt-mini": { inputPerMTokMicros: 1_000_000_000, outputPerMTokMicros: 1_000_000_000 } } }).where(eq(schema.workspace.id, ws.id));
    await oaFault({ mode: "slow", times: 1, delayMs: 1500 });
    const results = await Promise.allSettled([exec(ws.id, owner, ref(oa, "fake-gpt-mini")), exec(ws.id, owner, ref(oa, "fake-gpt-mini"))]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "BUDGET_EXCEEDED" });
    const ledger = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.workspaceId, ws.id), eq(schema.usageEvent.kind, "ai")));
    expect(ledger.filter((u) => u.status === "settled")).toHaveLength(1);
    expect(ledger.reduce((n, u) => n + (u.status === "released" ? 0 : Number(u.costMicros)), 0)).toBeLessThanOrEqual(150_000);
  });

  it("an unknown price under a hard cap is refused unless the owner allows it; allowUnknownCost doesn't change FREE_ONLY/LOW_COST", async () => {
    const { owner, ws } = await tenant("Unknown");
    const oa = await connect(owner, ws.id, "openai");
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: false });
    expect((await errCode(exec(ws.id, owner, ref(oa, "fake-gpt-mini"))))).toBe("AI_COST_UNKNOWN");
    expect(await hubCalls()).toEqual([]);
  });
});

/* ───────── streaming + cancellation ───────── */

describe("streaming", () => {
  it("cancellation mid-stream stops reading, records a cancelled attempt that may have been billed, and keeps its reservation", async () => {
    const { owner, ws } = await tenant("Cancel");
    const an = await connect(owner, ws.id, "anthropic");
    await db.update(schema.workspace).set({ prices: { "ai:anthropic/fake-claude": { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 1_000_000 } } }).where(eq(schema.workspace.id, ws.id));
    await hubFault({ provider: "anthropic", mode: "slow_stream", delayMs: 400 });
    const ac = new AbortController();
    const events: StreamEvent[] = [];
    const reqId = `t:${randomUUID()}`;
    const out = await exec(ws.id, owner, ref(an, "fake-claude"), {
      requestId: reqId,
      stream: true,
      signal: ac.signal,
      onStream: (e) => {
        events.push(e);
        if (e.type === "delta") ac.abort();
      },
    }).catch((e: unknown) => e);
    expect(out).not.toHaveProperty("result");
    expect(events.filter((e) => e.type === "delta")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "discard" });
    const [a] = await attempts({ requestId: reqId });
    expect(a).toMatchObject({ outcome: "cancelled", errorCode: "AI_CANCELLED", possibleCharge: true });
    const [u] = await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.idempotencyKey, `${reqId}:1`));
    expect(u!.status).toBe("settled");
    expect(Number(u!.costMicros)).toBeGreaterThan(0); // the defensible max, not 0
  });

  it("a stream cut mid-answer is discarded, never concatenated with the next route's answer", async () => {
    const { owner, ws } = await tenant("Cut");
    const an = await connect(owner, ws.id, "anthropic");
    const gm = await connect(owner, ws.id, "gemini");
    await hubFault({ provider: "anthropic", mode: "stream_cut", cutAfter: 3 });
    const events: StreamEvent[] = [];
    const reqId = `t:${randomUUID()}`;
    const r = await exec(ws.id, owner, ref(an, "fake-claude"), { requestId: reqId, stream: true, maxAttempts: 1, policy: { mode: "FALLBACK", allowUnknownCost: true, fallbackRoutes: [ref(gm, "fake-gemini")] }, onStream: (e) => events.push(e) });
    const byKey = (k: string) => events.filter((e) => e.type === "delta" && e.attemptKey === k).map((e) => (e as { text: string }).text).join("");
    expect(byKey(`${reqId}:1`).length).toBeGreaterThan(0); // anthropic streamed something…
    expect(events).toContainEqual({ type: "discard", attemptKey: `${reqId}:1`, reason: "AI_STREAM_INTERRUPTED" }); // …which was discarded
    expect(r.result.text).toBe(byKey(`${reqId}:2`)); // the answer is ONLY the gemini attempt
    expect(r.route.provider).toBe("gemini");
    expect((await attempts({ requestId: reqId })).map((a) => [a.provider, a.outcome, a.possibleCharge])).toEqual([
      ["anthropic", "interrupted", true],
      ["gemini", "success", false],
    ]);
  });
});

/* ───────── agents + Copilot on the hub ───────── */

describe("agents on the hub", () => {
  it("an agent version pins its route (picked, or the default snapshotted at save); runs are metered by the hub; tools still go through the runtime", async () => {
    const { owner, ws } = await tenant("Agent");
    const oa = await connect(owner, ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    await setDefaultRoute(db, ws.id, ref(oa, "fake-gpt-mini"));
    const src = await knowledgeSource(owner, ws.id);
    const tools = [{ tool: "knowledge_search" as const, permission: "allow" as const }];
    const picked = await createAgent(owner, ws.id, { name: "Claude agent", instructions: "Answer from the knowledge base.", tools, knowledgeSourceIds: [src.id], limits, route: ref(an, "fake-claude") });
    const snap = await createAgent(owner, ws.id, { name: "Default agent", instructions: "Answer.", tools, knowledgeSourceIds: [src.id], limits });
    const [pv] = await db.select().from(schema.agentVersion).where(eq(schema.agentVersion.id, picked.currentVersionId));
    const [sv] = await db.select().from(schema.agentVersion).where(eq(schema.agentVersion.id, snap.currentVersionId));
    expect(pv!.route).toEqual(ref(an, "fake-claude"));
    expect(sv!.route).toEqual(ref(oa, "fake-gpt-mini")); // snapshot of the default at save time
    // Changing the workspace default later doesn't change the saved version.
    await setDefaultRoute(db, ws.id, ref(an, "fake-claude"));

    const run = await runAgent((await startAgentRun({ agentId: picked.id, message: "What is the refund policy?", actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } })).id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    expect(run.output).toMatch(/Refunds/);
    const rows = await attempts({ agentRunId: run.id });
    expect(rows.map((a) => [a.provider, a.protocol, a.purpose, a.outcome])).toEqual([
      ["anthropic", "anthropic-messages", "agent", "success"],
      ["anthropic", "anthropic-messages", "agent", "success"],
    ]);
    const ledger = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.agentRunId, run.id), eq(schema.usageEvent.kind, "ai")));
    // One hub-metered ledger entry per model turn (step indexes are shared with the tool step in between).
    expect(ledger.map((u) => [u.idempotencyKey.replace(run.id, "R"), u.status]).sort()).toEqual([
      ["R:model:0:1", "settled"],
      ["R:model:2:1", "settled"],
    ]);
    const run2 = await runAgent((await startAgentRun({ agentId: snap.id, message: "Refunds?", actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } })).id);
    expect(run2.status).toBe("succeeded");
    expect((await attempts({ agentRunId: run2.id })).every((a) => a.connectionId === oa.id)).toBe(true);
  });

  it("a model retry never replays a tool: the failed attempt returns nothing, the tool runs once", async () => {
    const { owner, ws } = await tenant("NoReplay");
    const an = await connect(owner, ws.id, "anthropic");
    const src = await knowledgeSource(owner, ws.id);
    const agent = await createAgent(owner, ws.id, { name: "A", instructions: "Answer.", tools: [{ tool: "knowledge_search", permission: "allow" }], knowledgeSourceIds: [src.id], limits, route: ref(an, "fake-claude") });
    await post("/__fake/fault", { mode: "500", times: 1 }); // the first model call fails once
    const run = await runAgent((await startAgentRun({ agentId: agent.id, message: "Refunds?", actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } })).id);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    const steps = await db.select().from(schema.agentStep).where(eq(schema.agentStep.agentRunId, run.id)).orderBy(schema.agentStep.index);
    expect(steps.filter((s) => s.kind === "tool")).toHaveLength(1);
    expect((await attempts({ agentRunId: run.id })).map((a) => a.outcome)).toEqual(["error", "success", "success"]);
  });

  it("picking a route is checked against the saver's use_roles; a route that can't serve tools is refused before sending", async () => {
    const { owner, ws } = await tenant("AgentPerm");
    const editor = await makeUser("ag-ed");
    await addMember(ws.id, editor.id, "editor");
    const an = await connect(owner, ws.id, "anthropic");
    await expectHttpError(createAgent(editor, ws.id, { name: "E", instructions: "x", tools: [], limits, route: ref(an, "fake-claude") }), 403, "AI_ROUTE_FORBIDDEN");
    const or = await connect(owner, ws.id, "openrouter");
    const src = await knowledgeSource(owner, ws.id);
    const agent = await createAgent(owner, ws.id, { name: "NoTools", instructions: "x", tools: [{ tool: "knowledge_search", permission: "allow" }], knowledgeSourceIds: [src.id], limits, route: ref(or, "vendor/fake-notools") });
    const run = await runAgent((await startAgentRun({ agentId: agent.id, message: "hi", actingUser: owner, actor: { kind: "user", userId: owner.id, label: owner.email } })).id);
    expect(run.error).toMatchObject({ code: "AI_CAPABILITY_UNSUPPORTED" });
    expect(await hubCalls("openrouter")).toEqual([]);
  });
});

describe("Copilot on the hub", () => {
  it("planning uses the Copilot planning route, the bounded repair rounds use the repair route; each call is metered", async () => {
    const { owner, ws } = await tenant("Copilot");
    const oa = await connect(owner, ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    const gm = await connect(owner, ws.id, "gemini");
    await setDefaultRoute(db, ws.id, ref(oa, "fake-gpt-mini"));
    await setPolicy(ws.id, { mode: "MANUAL", allowUnknownCost: true, copilot: { planRoute: ref(an, "fake-claude"), repairRoute: ref(gm, "fake-gemini") } });
    const flow = await createFlow(owner, ws.id, { name: unique("CP") });
    await saveFlow(owner, flow.id, { baseRevision: 1, graph: { nodes: [node("t", "trigger.manual", { samplePayload: "{}" }), node("o", "output", { key: "r", expression: "" }, 200)], edges: [{ id: "e", source: "t", target: "o" }] } });
    const p = await propose(owner, flow.id, "teleport the data somewhere"); // always invalid → repair rounds
    expect(p.status).toBe("invalid");
    const rows = (await db.select().from(schema.aiAttempt).where(and(eq(schema.aiAttempt.workspaceId, ws.id), eq(schema.aiAttempt.purpose, "copilot")))).sort((a, b) => a.id - b.id);
    expect(rows.map((a) => a.connectionId)).toEqual([an.id, gm.id, gm.id]);
    const ledger = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.workspaceId, ws.id), eq(schema.usageEvent.kind, "ai")));
    expect(ledger.filter((u) => u.idempotencyKey.startsWith(`copilot:${flow.id}:`) && u.status === "settled")).toHaveLength(3);
  });
});

/* ───────── policy API ───────── */

describe("policy API (owner only; every route checked)", () => {
  it("validates modes, lists and ceilings; partial updates keep the rest; members can't change it", async () => {
    const { owner, ws } = await tenant("PolicyApi");
    const other = await tenant("PolicyOther");
    const foreign = await connect(other.owner, other.ws.id, "openai");
    const an = await connect(owner, ws.id, "anthropic");
    const cookie = await signIn(owner);
    expect((await call(cookie, policyPUT, "PUT", { wid: ws.id }, { mode: "FALLBACK" })).body).toMatchObject({ error: { code: "VALIDATION" } });
    expect((await call(cookie, policyPUT, "PUT", { wid: ws.id }, { mode: "LOW_COST", lowCostPool: [ref(an, "fake-claude")] })).body).toMatchObject({ error: { code: "VALIDATION" } });
    expect((await call(cookie, policyPUT, "PUT", { wid: ws.id }, { mode: "FALLBACK", fallbackRoutes: [ref(foreign, "fake-gpt-mini")] })).body).toMatchObject({ error: { code: "AI_CONNECTION_MISSING" } });
    const ok = await call(cookie, policyPUT, "PUT", { wid: ws.id }, { mode: "FALLBACK", fallbackRoutes: [ref(an, "fake-claude")], requireNoTraining: true });
    expect(ok.status).toBe(200);
    const kept = await call(cookie, policyPUT, "PUT", { wid: ws.id }, { allowUnknownCost: false }); // the Wave A toggle still works…
    expect(kept.body!.policy).toMatchObject({ mode: "FALLBACK", allowUnknownCost: false, requireNoTraining: true, fallbackRoutes: [ref(an, "fake-claude")] }); // …without resetting the rest
    const editor = await makeUser("pol-ed");
    await addMember(ws.id, editor.id, "editor");
    expect((await call(await signIn(editor), policyPUT, "PUT", { wid: ws.id }, { mode: "MANUAL" })).status).toBe(403);
  });
});
