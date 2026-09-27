import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { db, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { createAgent, startAgentRun } from "@/server/agents";
import { checkGate, decide } from "@/server/approvals";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRunEx } from "@/server/runs";
import { agentGateRequest } from "../../worker/agent-runner";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

afterAll(closeDb);

function graph(expression: string): FlowGraph {
  return {
    nodes: [
      { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: '{ "n": 1 }' } } },
      { id: "x", type: "transform.json", position: { x: 200, y: 0 }, data: { label: "Transform", config: { expression } } },
      { id: "o", type: "output", position: { x: 400, y: 0 }, data: { label: "Out", config: { key: "r", expression: "" } } },
    ],
    edges: [{ id: "e1", source: "t", target: "x" }, { id: "e2", source: "x", target: "o" }],
  };
}

// Codex CX3-02 regression (originally a failing PoC).
it("requires fresh approval after the approved workflow is republished", async () => {
  const owner = await makeUser("cx3-approval");
  const ws = await createWorkspace(owner, unique("Cx3Approval"));
  const flow = await createFlow(owner, ws.id, { name: unique("ApprovedFlow") });
  await saveFlow(owner, flow.id, { baseRevision: flow.revision, graph: graph('{ "v": n * 2 }') });
  await publishFlow(owner, flow.id);
  const agent = await createAgent(owner, ws.id, {
    name: "Approval PoC", instructions: "Run the workflow.",
    tools: [{ tool: "run_workflow", flowId: flow.id, permission: "ask" }],
  });
  const run = await startAgentRun({
    agentId: agent.id, message: "Run the workflow", actingUser: owner,
    actor: { kind: "user", userId: owner.id, label: owner.email },
  });
  const [before] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
  const call = { id: "t1_0", name: "run_workflow", arguments: { workflow: before!.name, input: { n: 5 } } };
  const gateAt = (publishedVersionId: string | null) =>
    agentGateRequest({ workspaceId: ws.id, agentRunId: run.id, agentVersionId: run.agentVersionId, index: 1, call, flow: before!, connections: [], publishedVersionId });
  const gate = gateAt(before!.publishedVersionId);
  const opened = await checkGate(db, gate);
  expect(opened.status).toBe("pending");
  await decide(db, { workspaceId: ws.id, approvalId: opened.approvalId, userId: owner.id, decision: "approve" });

  await saveFlow(owner, flow.id, { baseRevision: before!.revision, graph: graph('{ "v": n * 1000 }') });
  await publishFlow(owner, flow.id);
  const [after] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
  expect(after!.publishedVersionId).not.toBe(before!.publishedVersionId);
  // The runner builds the gate from the CURRENT published version on resume → the old approval doesn't cover it.
  const resumed = await checkGate(db, gateAt(after!.publishedVersionId));
  expect(resumed.status).toBe("pending");
  // And enqueueing the version the approval covered is refused atomically.
  await expect(enqueueRunEx(owner, flow.id, { triggerKind: "agent", usePublished: true, expectPublishedVersionId: before!.publishedVersionId!, input: { n: 5 } })).rejects.toMatchObject({ status: 409, code: "WORKFLOW_REPUBLISHED" });
});
