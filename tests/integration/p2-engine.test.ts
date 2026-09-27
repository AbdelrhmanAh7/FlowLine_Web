import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { createFlow, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun, rerunFromStep, rerunPreview } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimNextRun, processRun } from "../../worker/runner";
import { addMember, claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

/** Engine guarantees from the Phase 2 prompt: immutable versions, run ↔ version/input/policy, versioned subflows, rerun revisions, re-authorization. */
beforeAll(async () => {
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
});
afterAll(async () => {
  stopSandbox();
  await closeDb();
});

let x = 0;
const node = (id: string, type: FlowNode["type"], config: Record<string, unknown>): FlowNode => ({ id, type, position: { x: (x += 200), y: 0 }, data: { label: id, config: config as never } });
const chain = (...nodes: FlowNode[]): FlowGraph => ({ nodes, edges: nodes.slice(1).map((n, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: n.id })) });
const trigger = (payload: unknown) => node("t", "trigger.manual", { samplePayload: JSON.stringify(payload) });
const transform = (id: string, expression: string) => node(id, "transform.json", { expression });
const out = (expression = "") => node("o", "output", { key: "r", expression });

async function setup(name: string) {
  const user = await makeUser("eng");
  const ws = await createWorkspace(user, unique(name));
  const flowOf = async (graph: FlowGraph, flowName = unique(name)) => {
    const flow = await createFlow(user, ws.id, { name: flowName });
    const saved = await saveFlow(user, flow.id, { baseRevision: 1, graph });
    return { ...flow, revision: saved.flow.revision };
  };
  return { user, ws, flowOf };
}
const versionOf = async (flowId: string, reason = "publish") =>
  (await db.select().from(schema.flowVersion).where(and(eq(schema.flowVersion.flowId, flowId), eq(schema.flowVersion.reason, reason))))[0]!;

describe("immutable versions; each run is pinned to its version, input and policy", () => {
  it("a published version can't be modified", async () => {
    const { user, flowOf } = await setup("Immutable");
    const flow = await flowOf(chain(trigger({ a: 1 }), out()));
    await publishFlow(user, flow.id);
    const v = await versionOf(flow.id);
    await expect(db.update(schema.flowVersion).set({ graph: { nodes: [], edges: [] } }).where(eq(schema.flowVersion.id, v.id))).rejects.toThrow();
  });

  it("a run keeps its version, input and acting user even after the flow changes", async () => {
    const { user, flowOf } = await setup("Pinned");
    const flow = await flowOf(chain(trigger({ n: 2 }), transform("x", "{ \"double\": n * 2 }"), out()));
    const run = await enqueueRun(user, flow.id);
    await saveFlow(user, flow.id, { baseRevision: flow.revision, graph: chain(trigger({ n: 2 }), transform("x", "{ \"double\": n * 100 }"), out()) });
    await claimAndProcess(run.id);
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    expect(done.output).toEqual({ r: { double: 4 } }); // the version it was queued with, not the edit
    expect(done.input).toEqual({ n: 2 });
    expect(done.policy).toMatchObject({ actingUserId: user.id });
    expect(done.flowVersionId).toBeTruthy();
  });
});

describe("versioned subflows", () => {
  it("a parent runs the pinned published version of its subflow; later edits don't leak in", async () => {
    const { user, flowOf } = await setup("Sub");
    const child = await flowOf(chain(trigger({ v: 1 }), transform("x", '{ "tag": "v1:" & $string(v) }'), out()), unique("Child"));
    await publishFlow(user, child.id);
    const v1 = await versionOf(child.id);
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, child.id));
    await saveFlow(user, child.id, { baseRevision: f!.revision, graph: chain(trigger({ v: 1 }), transform("x", '{ "tag": "EDITED" }'), out()) });
    const parent = await flowOf(chain(trigger({ v: 7 }), node("sub", "flow.subflow", { flowId: child.id, version: v1.version, input: "{ \"v\": v }" }), out()));
    const run = await enqueueRun(user, parent.id);
    await claimAndProcess(run.id);
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    expect(JSON.stringify(done.output)).toContain("v1:7");
    expect(JSON.stringify(done.output)).not.toContain("EDITED");
  });

  it("refuses unpublished versions, other workspaces' flows and self-calls", async () => {
    const { user, flowOf } = await setup("SubRefuse");
    const draft = await flowOf(chain(trigger({}), out()), unique("Draft"));
    const [saveV] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.flowId, draft.id));
    const a = await flowOf(chain(trigger({}), node("sub", "flow.subflow", { flowId: draft.id, version: saveV?.version ?? 1, input: "" }), out()));
    const r1 = await enqueueRun(user, a.id);
    await claimAndProcess(r1.id);
    expect((await freshRun(r1.id)).error?.code).toMatch(/SUBFLOW_NOT_(PUBLISHED|FOUND)/);

    const other = await setup("Other");
    const foreign = await other.flowOf(chain(trigger({}), out()));
    await publishFlow(other.user, foreign.id);
    const fv = await versionOf(foreign.id);
    const b = await flowOf(chain(trigger({}), node("sub", "flow.subflow", { flowId: foreign.id, version: fv.version, input: "" }), out()));
    const r2 = await enqueueRun(user, b.id);
    await claimAndProcess(r2.id);
    expect((await freshRun(r2.id)).error?.code).toBe("SUBFLOW_NOT_FOUND");

    const self = await flowOf(chain(trigger({}), out()));
    await publishFlow(user, self.id);
    const sv = await versionOf(self.id);
    const [cur] = await db.select().from(schema.flow).where(eq(schema.flow.id, self.id));
    await saveFlow(user, self.id, { baseRevision: cur!.revision, graph: chain(trigger({}), node("sub", "flow.subflow", { flowId: self.id, version: sv.version, input: "" }), out()) });
    const r3 = await enqueueRun(user, self.id);
    await claimAndProcess(r3.id);
    expect((await freshRun(r3.id)).error?.code).toBe("SUBFLOW_CYCLE");
  });
});

describe("re-run from a step against a known revision", () => {
  it("'original' re-runs the run's own version; 'latest' uses the current flow (with a preview of both)", async () => {
    const { user, flowOf } = await setup("Revision");
    const flow = await flowOf(chain(trigger({ n: 3 }), transform("a", '{ "n": n }'), transform("b", '{ "v": n * 10 }'), out()));
    const r1 = await enqueueRun(user, flow.id);
    await claimAndProcess(r1.id);
    const first = await freshRun(r1.id);
    expect(first.output).toEqual({ r: { v: 30 } });
    const [cur] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    await saveFlow(user, flow.id, { baseRevision: cur!.revision, graph: chain(trigger({ n: 3 }), transform("a", '{ "n": n }'), transform("b", '{ "v": n * 1000 }'), out()) });

    const pOrig = await rerunPreview(first, "b", "original");
    const pLatest = await rerunPreview(first, "b", "latest");
    expect(pOrig.reused.map((s) => s.nodeId)).toEqual(expect.arrayContaining(["t", "a"]));
    expect(pLatest.willRerun.map((s) => s.nodeId)).toContain("b");

    const orig = await rerunFromStep(user, first, "b", "original");
    await claimAndProcess(orig.id);
    expect((await freshRun(orig.id)).output).toEqual({ r: { v: 30 } });
    const latest = await rerunFromStep(user, first, "b", "latest");
    await claimAndProcess(latest.id);
    expect((await freshRun(latest.id)).output).toEqual({ r: { v: 3000 } });
  });

  it("authorization is re-checked when the run executes: a user demoted to viewer can't have a queued re-run execute", async () => {
    const { user: owner, ws, flowOf } = await setup("Reauth");
    const editor = await makeUser("editor");
    await addMember(ws.id, editor.id, "editor");
    const flow = await flowOf(chain(trigger({}), transform("a", '{ "ok": true }'), out()));
    const r1 = await enqueueRun(owner, flow.id);
    await claimAndProcess(r1.id);
    const re = await rerunFromStep(editor, await freshRun(r1.id), "a");
    await db.update(schema.workspaceMember).set({ role: "viewer" }).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, editor.id)));
    await claimAndProcess(re.id);
    const done = await freshRun(re.id);
    expect(done.status).toBe("failed");
    expect(done.error?.code).toBe("PERMISSION_REVOKED");
  });
});
