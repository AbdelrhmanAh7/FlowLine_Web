import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { db, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { decideProposal, propose } from "@/server/copilot";
import { createFlow, saveFlow } from "@/server/flows";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prevEnv = { ...process.env };
beforeAll(async () => {
  ai = await startFakeAi(0);
  process.env.OLLAMA_BASE_URL = ai.url;
  process.env.FLOWLINE_AI_PROVIDER = "ollama";
  process.env.FLOWLINE_AI_MODEL = "fake-model";
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${ai.port}`;
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
