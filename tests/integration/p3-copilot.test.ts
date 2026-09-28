import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { connectAi, useAiDouble } from "./ai-helpers";
import { db, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { decideNewFlowProposal, decideProposal, propose, proposeNewFlow } from "@/server/copilot";
import { createFlow, saveFlow } from "@/server/flows";
import { createWorkspace, updateWorkspace } from "@/server/workspaces";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prevEnv = { ...process.env };
beforeAll(async () => {
  ai = await startFakeAi(0);
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${ai.port}`;
  useAiDouble(ai.url);
});
afterAll(async () => {
  Object.assign(process.env, prevEnv);
  await ai.close();
  await closeDb();
});

const existing = (): FlowGraph => ({
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: '{ "n": 1 }' } } },
    { id: "x", type: "transform.json", position: { x: 260, y: 0 }, data: { label: "Double", config: { expression: '{ "v": n * 2 }' } } },
    { id: "o", type: "output", position: { x: 520, y: 0 }, data: { label: "Out", config: { key: "r", expression: "" } } },
  ],
  edges: [
    { id: "e1", source: "t", target: "x" },
    { id: "e2", source: "x", target: "o" },
  ],
});

async function setup(graph?: FlowGraph) {
  const user = await makeUser("cp");
  const ws = await createWorkspace(user, unique("Copilot"));
  await connectAi(user, ws.id); // Copilot uses the workspace default AI connection
  const flow = await createFlow(user, ws.id, { name: unique("Flow") });
  if (graph) await saveFlow(user, flow.id, { baseRevision: 1, graph });
  return { user, ws, flow };
}
const flowRow = async (id: string) => (await db.select().from(schema.flow).where(eq(schema.flow.id, id)))[0]!;
const runsOf = async (id: string) => db.select().from(schema.run).where(eq(schema.run.flowId, id));

describe("Copilot proposals", () => {
  it("generates a valid workflow from a description; approval saves a DRAFT (no run, no publish); missing credentials are flagged, never invented", async () => {
    const { user, ws, flow } = await setup();
    await db.insert(schema.connection).values({ workspaceId: ws.id, provider: "postgres", label: "Warehouse", authType: "connection_string", accountId: "pg", accountLabel: "pg", secretEnc: "x", keyId: "k" });
    const before = await flowRow(flow.id);
    const p = await propose(user, flow.id, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    expect(p.status).toBe("proposed");
    expect(p.diff!.added.map((a) => a.type)).toEqual(["trigger.schedule", "integration.action", "ai.generate", "integration.action", "output"]);
    expect(p.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_CREDENTIAL", severity: "warning", nodeId: "mail" })]));
    expect(p.issues.filter((i) => i.severity === "error")).toEqual([]);
    const pg = (p.proposedGraph as FlowGraph).nodes.find((n) => n.id === "kpis")!;
    expect((pg.data.config as { connectionId: string }).connectionId).not.toBe(""); // the real, existing connection
    expect((await flowRow(flow.id)).revision).toBe(before.revision); // nothing saved yet

    const approved = await decideProposal(user, flow.id, p.id, { decision: "approve" });
    expect(approved.status).toBe("approved");
    const after = await flowRow(flow.id);
    expect(after.revision).toBe(before.revision + 1);
    expect((after.graph as FlowGraph).nodes).toHaveLength(5);
    expect(after.publishedVersionId).toBeNull();
    expect(await runsOf(flow.id)).toHaveLength(0);
    await expectHttpError(decideProposal(user, flow.id, p.id, { decision: "approve" }), 409, "PROPOSAL_CLOSED");
  });

  it.each([
    ["an invented node type", "teleport the result", "UNKNOWN_NODE_TYPE"],
    ["an integration that doesn't exist", "post the result to discord", "UNKNOWN_INTEGRATION"],
    ["an invented parameter", "add a bogus transform", "UNKNOWN_PARAMETER"],
    ["a fabricated credential", "post to slack with a hardcoded credential", "UNKNOWN_CONNECTION"],
  ])("refuses %s: invalid, with the reason, and it can't be applied", async (_n, request, code) => {
    const { user, flow } = await setup(existing());
    const before = await flowRow(flow.id);
    const p = await propose(user, flow.id, request);
    expect(p.status).toBe("invalid");
    expect(p.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code, severity: "error" })]));
    await expectHttpError(decideProposal(user, flow.id, p.id, { decision: "approve" }), 409, "PROPOSAL_CLOSED");
    expect((await flowRow(flow.id)).revision).toBe(before.revision);
  });

  it("patches an existing flow without dropping the user's steps", async () => {
    const { user, flow } = await setup(existing());
    const p = await propose(user, flow.id, "add a condition before the output");
    expect(p.status).toBe("proposed");
    expect(p.diff!.removed).toEqual([]);
    expect(p.diff!.added.map((a) => a.id)).toEqual(["gate"]);
    await decideProposal(user, flow.id, p.id, { decision: "approve" });
    const g = (await flowRow(flow.id)).graph as FlowGraph;
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["gate", "o", "t", "x"]);
    expect(g.nodes.find((n) => n.id === "x")!.data.config).toEqual({ expression: '{ "v": n * 2 }' }); // untouched
  });

  it("removals are shown and need explicit confirmation; rejected proposals change nothing", async () => {
    const { user, flow } = await setup(existing());
    const p = await propose(user, flow.id, "remove Double");
    expect(p.diff!.removed).toEqual([expect.objectContaining({ id: "x", label: "Double" })]);
    await expectHttpError(decideProposal(user, flow.id, p.id, { decision: "approve" }), 409, "CONFIRM_REMOVALS");
    const rev = (await flowRow(flow.id)).revision;
    const rejected = await decideProposal(user, flow.id, p.id, { decision: "reject" });
    expect(rejected.status).toBe("rejected");
    expect((await flowRow(flow.id)).revision).toBe(rev);

    const p2 = await propose(user, flow.id, "remove Double");
    await decideProposal(user, flow.id, p2.id, { decision: "approve", confirmRemovals: true });
    const g = (await flowRow(flow.id)).graph as FlowGraph;
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["o", "t"]);
    expect(g.edges).toEqual([expect.objectContaining({ source: "t", target: "o" })]);
  });

  it("a proposal made against an older revision never overwrites newer work", async () => {
    const { user, flow } = await setup(existing());
    const p = await propose(user, flow.id, "add a condition");
    const cur = await flowRow(flow.id);
    const g = existing();
    g.nodes[1]!.data.label = "Edited by a teammate";
    await saveFlow(user, flow.id, { baseRevision: cur.revision, graph: g });
    await expectHttpError(decideProposal(user, flow.id, p.id, { decision: "approve" }), 409, "PROPOSAL_STALE");
    const after = (await flowRow(flow.id)).graph as FlowGraph;
    expect(after.nodes.find((n) => n.id === "x")!.data.label).toBe("Edited by a teammate");
    expect(after.nodes.some((n) => n.id === "gate")).toBe(false);
  });

  it("an AI failure produces an invalid proposal with the reason, not a broken flow", async () => {
    const { user, flow } = await setup(existing());
    await fetch(`${ai.url}/__fake/fault`, { method: "POST", body: JSON.stringify({ mode: "bad_json", times: 1 }) });
    const p = await propose(user, flow.id, "add a condition");
    expect(p.status).toBe("invalid");
    expect(p.issues[0]!.code).toMatch(/AI_ERROR|INVALID_PATCH/);
  });
});

describe("Copilot usage accounting", () => {
  it("every model call is metered with its tokens; an exhausted budget refuses before calling the model", async () => {
    const { ws, flow, user } = await setup();
    const p = await propose(user, flow.id, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    expect(p.status).toBe("proposed");
    const events = (await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.workspaceId, ws.id))).filter((e) => e.idempotencyKey.startsWith(`copilot:${flow.id}:`));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "ai", status: "settled", provider: "openai", model: "fake-gpt-mini" });
    expect(events[0]!.inputTokens).toBeGreaterThan(0);

    // A tiny budget and a real price: the next proposal is refused up front, with no model call recorded.
    await updateWorkspace(ws.id, { monthlyBudget: 0.000001, prices: { "ai:openai/fake-gpt-mini": { inputPerMTok: 100, outputPerMTok: 100 } } });
    const before = (await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.workspaceId, ws.id))).length;
    const refused = await propose(user, flow.id, "add a condition");
    expect(refused.status).toBe("invalid");
    expect(refused.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "BUDGET_EXCEEDED" })]));
    const after = await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.workspaceId, ws.id));
    expect(after.filter((e) => e.status === "settled").length).toBe(events.length);
    expect(after.length).toBeLessThanOrEqual(before + 1); // at most the refused reservation record, never a settled call
  });
});

describe("Create with Copilot (new flow)", () => {
  const flowsIn = async (workspaceId: string) => db.select().from(schema.flow).where(eq(schema.flow.workspaceId, workspaceId));

  it("creates no flow until a proposal is approved; rejected and invalid proposals leave nothing behind (Codex CX3Q-05)", async () => {
    const user = await makeUser("cpn");
    const ws = await createWorkspace(user, unique("CopilotNew"));
  await connectAi(user, ws.id);
    const before = (await flowsIn(ws.id)).length;

    const bad = await proposeNewFlow(user, ws.id, "teleport the result");
    expect(bad.status).toBe("invalid");
    expect(bad.flowId).toBeNull();
    const rejected = await proposeNewFlow(user, ws.id, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    expect(rejected.status).toBe("proposed");
    await decideNewFlowProposal(user, ws.id, rejected.id, { decision: "reject" });
    expect(await flowsIn(ws.id)).toHaveLength(before);

    const good = await proposeNewFlow(user, ws.id, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    const approved = await decideNewFlowProposal(user, ws.id, good.id, { decision: "approve" });
    expect(approved.status).toBe("approved");
    const flows = await flowsIn(ws.id);
    expect(flows).toHaveLength(before + 1);
    const created = flows.find((f) => f.id === approved.flowId)!;
    expect((created.graph as FlowGraph).nodes.length).toBe(good.diff!.added.length);
    expect(created.publishedVersionId).toBeNull(); // a draft: never published
    expect(await runsOf(created.id)).toHaveLength(0); // and never run
    await expectHttpError(decideNewFlowProposal(user, ws.id, good.id, { decision: "approve" }), 409, "PROPOSAL_CLOSED"); // single use

    // Another workspace can't decide it.
    const other = await makeUser("cpo");
    const ows = await createWorkspace(other, unique("Other"));
    const p2 = await proposeNewFlow(user, ws.id, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    await expectHttpError(decideNewFlowProposal(other, ows.id, p2.id, { decision: "approve" }), 404);
  });
});
