import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph } from "@/engine/types";
import { createConnection, setVisibility } from "@/server/connections";
import { createFlow, getVersion, restoreVersion, saveFlow, shareFlowCopy } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { claimNextRun, processRun } from "../../worker/runner";
import { addMember, claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

let fake: Fake;
const prev = { ...process.env };
beforeAll(async () => {
  fake = await startFake();
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
});
afterAll(async () => {
  Object.assign(process.env, prev);
  stopSandbox();
  await fake.close();
  await closeDb();
});

const slackGraph = (connectionId: string, channel: string): FlowGraph => ({
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: "{}" } } },
    { id: "s", type: "integration.action", position: { x: 200, y: 0 }, data: { label: "Post", config: { actionId: "slack.post_message", connectionId, inputMapping: `{ "channel": "${channel}", "text": "hi" }`, requireApproval: false, retry: { maxAttempts: 1 } } as never } },
    { id: "o", type: "output", position: { x: 400, y: 0 }, data: { label: "Out", config: { key: "r", expression: "" } } },
  ],
  edges: [
    { id: "e1", source: "t", target: "s" },
    { id: "e2", source: "s", target: "o" },
  ],
});
const stepOf = async (runId: string, nodeId: string) => (await db.select().from(schema.runStep).where(eq(schema.runStep.runId, runId))).find((s) => s.nodeId === nodeId)!;

describe("private connections are never shared", () => {
  it("only the creator's runs may use a private connection; others can't publish with it or change its visibility", async () => {
    const owner = await makeUser("own");
    const editor = await makeUser("ed");
    const ws = await createWorkspace(owner, unique("Private"));
    await addMember(ws.id, editor.id, "editor");
    const mine = await createConnection(db, owner.id, ws.id, "slack", "Owner's Slack", { token: "test-token" }, { visibility: "private" });
    expect(mine.visibility).toBe("private");
    const flow = await createFlow(owner, ws.id, { name: unique("F") });
    await saveFlow(owner, flow.id, { baseRevision: 1, graph: slackGraph(mine.id, unique("C_PRIV")) });

    const ownRun = await enqueueRun(owner, flow.id);
    await claimAndProcess(ownRun.id);
    expect((await freshRun(ownRun.id)).status).toBe("succeeded");

    // The editor can see and run the flow, but not with the owner's private credential.
    const edRun = await enqueueRun(editor, flow.id);
    await claimAndProcess(edRun.id);
    expect((await freshRun(edRun.id)).status).toBe("failed");
    expect((await stepOf(edRun.id, "s")).error).toMatchObject({ code: "CONNECTION_PRIVATE" });

    await expectHttpError(publishFlow(editor, flow.id), 422, "CONNECTION_PRIVATE");
    await expectHttpError(setVisibility(db, editor.id, ws.id, mine.id, "workspace"), 403, "NOT_CONNECTION_OWNER");
    await publishFlow(owner, flow.id); // triggered runs act for the owner, who may use it

    await setVisibility(db, owner.id, ws.id, mine.id, "workspace");
    const edRun2 = await enqueueRun(editor, flow.id);
    await claimAndProcess(edRun2.id);
    expect((await freshRun(edRun2.id)).status).toBe("succeeded");
  });
});

describe("sharing a flow copies the definition, never the credentials", () => {
  it("clears connection ids in the copy; needs edit access in the target; the source is unchanged", async () => {
    const user = await makeUser("sh");
    const a = await createWorkspace(user, unique("SrcWs"));
    const b = await createWorkspace(user, unique("DstWs"));
    const conn = await createConnection(db, user.id, a.id, "slack", "A Slack", { token: "test-token" });
    const flow = await createFlow(user, a.id, { name: unique("Shared") });
    await saveFlow(user, flow.id, { baseRevision: 1, graph: slackGraph(conn.id, "C1") });
    const { flow: copy, clearedConnections } = await shareFlowCopy(user, flow.id, b.id);
    expect(clearedConnections).toBe(1);
    expect(copy.workspaceId).toBe(b.id);
    expect(JSON.stringify(copy.graph)).not.toContain(conn.id);
    const [src] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    expect(JSON.stringify(src!.graph)).toContain(conn.id);
  });
});

describe("versions: inspect, rollback, history intact, concurrency", () => {
  const g = (mult: number): FlowGraph => ({
    nodes: [
      { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: '{ "n": 2 }' } } },
      { id: "x", type: "transform.json", position: { x: 200, y: 0 }, data: { label: "Mult", config: { expression: `{ "v": n * ${mult} }` } } },
      { id: "o", type: "output", position: { x: 400, y: 0 }, data: { label: "Out", config: { key: "r", expression: "" } } },
    ],
    edges: [
      { id: "e1", source: "t", target: "x" },
      { id: "e2", source: "x", target: "o" },
    ],
  });

  it("rolls back to a published version as a new revision; old runs keep their version; stale restores are refused", async () => {
    const user = await makeUser("vr");
    const ws = await createWorkspace(user, unique("Versions"));
    const flow = await createFlow(user, ws.id, { name: unique("V") });
    await saveFlow(user, flow.id, { baseRevision: 1, graph: g(2) });
    const pub1 = await publishFlow(user, flow.id);
    void pub1;
    const [f1] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    const v1 = f1!.publishedVersionId!;
    const r1 = await enqueueRun(user, flow.id, { triggerKind: "api", usePublished: true, actingUserId: user.id });
    await claimAndProcess(r1.id);
    expect((await freshRun(r1.id)).output).toEqual({ r: { v: 4 } });

    await saveFlow(user, flow.id, { baseRevision: f1!.revision, graph: g(10) });
    await publishFlow(user, flow.id);
    const [f2] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    expect(f2!.publishedVersionId).not.toBe(v1);

    // Rollback to v1's definition: a NEW draft revision; v1 itself is untouched.
    await expectHttpError(restoreVersion(user, flow.id, v1, f2!.revision - 1), 409);
    const restored = await restoreVersion(user, flow.id, v1, f2!.revision);
    expect(restored.flow.revision).toBe(f2!.revision + 1);
    expect((restored.flow.graph as FlowGraph).nodes[1]!.data.config).toEqual({ expression: '{ "v": n * 2 }' });
    await publishFlow(user, flow.id);
    const r2 = await enqueueRun(user, flow.id, { triggerKind: "api", usePublished: true, actingUserId: user.id });
    await claimAndProcess(r2.id);
    expect((await freshRun(r2.id)).output).toEqual({ r: { v: 4 } });

    // History: the first run still points at v1, whose definition is unchanged.
    expect((await freshRun(r1.id)).flowVersionId).toBe(v1);
    expect(((await getVersion(flow.id, v1)).graph as FlowGraph).nodes[1]!.data.config).toEqual({ expression: '{ "v": n * 2 }' });
  });
});
