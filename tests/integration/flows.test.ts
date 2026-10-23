import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as v1FlowsGET } from "@/app/api/v1/flows/route";
import { db, schema } from "@/db";
import { requireFlow } from "@/server/access";
import { createApiKey } from "@/server/apikeys";
import { resetFaults, setFault } from "@/server/faults";
import { createFlow, listFlows, listVersions, saveFlow, softDeleteFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import type { CurrentUser } from "@/server/access";
import type { FlowGraph } from "@/engine/types";
import { BLANK_GRAPH, LOCAL_TEMPLATES } from "@/engine/templates";
import { claimNextRun, processRun } from "../../worker/runner";
import { claimAndProcess, claimUntil, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

afterAll(closeDb);
afterEach(() => resetFaults());

async function setup() {
  const user = await makeUser("flow");
  const ws = await createWorkspace(user, unique("Flows"));
  return { user, ws };
}

const save = (user: CurrentUser, flowId: string, input: Parameters<typeof saveFlow>[2]) => saveFlow(user, flowId, input);

describe("createFlow", () => {
  it("creates a blank flow", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { name: unique("Blank") });
    expect(flow.graph).toEqual(BLANK_GRAPH);
    expect(flow.revision).toBe(1);
    expect(flow.templateId).toBeNull();
    expect(flow.workspaceId).toBe(ws.id);
    expect(flow.createdBy).toBe(user.id);
  });

  it("creates a flow from a local template", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    const template = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!;
    expect(flow.name).toBe(template.name);
    expect(flow.templateId).toBe("lead-qualifier");
    expect((flow.graph as FlowGraph).nodes).toHaveLength(5);
    // The stored graph must be a copy, not the shared template object.
    expect(flow.graph).not.toBe(template.graph);
  });

  it("creates a template flow in the creator's language; English is exactly the template (CX4Q-01)", async () => {
    const { user, ws } = await setup();
    const template = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!;
    const english = await createFlow(user, ws.id, { templateId: "lead-qualifier" }, "en");
    expect(english.name).toBe("Lead Qualifier");
    expect(english.graph).toEqual(template.graph);

    const arabic = await createFlow(user, ws.id, { templateId: "lead-qualifier" }, "ar");
    expect(arabic.name).toBe("تأهيل العملاء المحتملين");
    const nodes = (arabic.graph as FlowGraph).nodes;
    expect(nodes.find((n) => n.id === "normalise")!.data.label).toBe("توحيد بيانات العميل");
    expect(nodes.find((n) => n.id === "is-hot")!.data.label).toBe("50 موظفًا أو أكثر؟");
    // Only labels change: ids, types, config and edges are the template's.
    expect(nodes.map((n) => [n.id, n.type, n.data.config])).toEqual(template.graph.nodes.map((n) => [n.id, n.type, n.data.config]));
    expect((arabic.graph as FlowGraph).edges).toEqual(template.graph.edges);
    // An explicit name still wins, and the shared template is untouched.
    expect((await createFlow(user, ws.id, { templateId: "lead-qualifier", name: "Mine" }, "ar")).name).toBe("Mine");
    expect(template.graph.nodes[1]!.data.label).toBe("Normalise lead");
  });

  it("rejects an unknown template with 400", async () => {
    const { user, ws } = await setup();
    await expectHttpError(createFlow(user, ws.id, { templateId: "no-such-template" }), 400, "UNKNOWN_TEMPLATE");
  });
});

describe("saveFlow", () => {
  it("bumps the revision on every accepted save", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    const first = await save(user, flow.id, { baseRevision: 1, name: unique("Renamed") });
    expect(first.flow.revision).toBe(2);
    const second = await save(user, flow.id, { baseRevision: 2 });
    expect(second.flow.revision).toBe(3);

    const [stored] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    expect(stored.revision).toBe(3);
    expect(stored.updatedBy).toBe(user.id);
  });

  it("rejects a stale baseRevision with 409 and the server revision in details", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    await save(user, flow.id, { baseRevision: 1 });

    const err = await expectHttpError(save(user, flow.id, { baseRevision: 1, name: unique("Stale") }), 409, "REVISION_CONFLICT");
    const details = err.details as { serverRevision: number; serverName: string };
    expect(details.serverRevision).toBe(2);
    expect(details.serverName).toBe(flow.name);
  });

  it("force:true overwrites and keeps the server copy as an 'overwrite' version", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    await save(user, flow.id, { baseRevision: 1, name: unique("Server copy") });

    const result = await save(user, flow.id, { baseRevision: 1, name: unique("Offline copy"), force: true });
    expect(result.flow.revision).toBe(3);

    const versions = await listVersions(flow.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].reason).toBe("overwrite");
    expect(versions[0].revision).toBe(2); // the overwritten server copy
    expect(versions[0].version).toBeNull(); // only publications are numbered (#204)
  });

  it("createVersion:true records a 'save' version; autosave does not", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });

    const autosave = await save(user, flow.id, { baseRevision: 1 });
    expect(autosave.version).toBeNull();
    expect(await listVersions(flow.id)).toHaveLength(0);

    const explicit = await save(user, flow.id, { baseRevision: 2, createVersion: true });
    expect(explicit.version?.reason).toBe("save");
    expect(explicit.version?.revision).toBe(3);

    const versions = await listVersions(flow.id);
    expect(versions).toHaveLength(1);
    // Unnumbered since #204: only a publication takes a version number.
    expect(versions[0]).toMatchObject({ version: null, revision: 3, reason: "save" });

    await save(user, flow.id, { baseRevision: 3, createVersion: true });
    expect((await listVersions(flow.id)).map(({ version, revision, reason }) => ({ version, revision, reason }))).toEqual([
      { version: null, revision: 4, reason: "save" },
      { version: null, revision: 3, reason: "save" },
    ]);
  });

  it("404s when saving a deleted flow", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, {});
    await softDeleteFlow(flow.id);
    await expectHttpError(save(user, flow.id, { baseRevision: 1 }), 404, "NOT_FOUND");
  });

  it("an injected save fault fails once with 500 and the next save succeeds", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });

    setFault(user.id, "save", 1);
    await expectHttpError(save(user, flow.id, { baseRevision: 1 }), 500, "INJECTED_FAULT");

    // Fault consumed: the retry goes through and the revision was not bumped by the failure.
    const retry = await save(user, flow.id, { baseRevision: 1 });
    expect(retry.flow.revision).toBe(2);
  });
});

describe("softDeleteFlow", () => {
  it("hides the flow from listFlows and requireFlow", async () => {
    const { user, ws } = await setup();
    const keep = await createFlow(user, ws.id, { name: unique("Keep") });
    const gone = await createFlow(user, ws.id, { name: unique("Gone") });

    await softDeleteFlow(gone.id);

    const listed = await listFlows(ws.id);
    expect(listed.some((f) => f.id === keep.id)).toBe(true);
    expect(listed.some((f) => f.id === gone.id)).toBe(false);

    await expectHttpError(requireFlow(user, gone.id), 404, "NOT_FOUND");
    const stillThere = await requireFlow(user, keep.id);
    expect(stillThere.flow.id).toBe(keep.id);

    // Row still exists in the DB — it's a soft delete.
    const [row] = await db.select().from(schema.flow).where(eq(schema.flow.id, gone.id));
    expect(row.deletedAt).not.toBeNull();
  });
});

describe("flow list run summary (regression: #117)", () => {
  /** GET /api/v1/flows the way an API client calls it: a Bearer key with flows:read and no session. */
  async function v1Flows(user: CurrentUser, workspaceId: string) {
    const { key } = await createApiKey(user, workspaceId, { name: unique("list"), mode: "test", scopes: ["flows:read"] });
    const res = await v1FlowsGET(new Request("http://localhost/api/v1/flows", { headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({}) } as never);
    expect(res.status).toBe(200);
    return ((await res.json()) as { flows: Record<string, unknown>[] }).flows;
  }
  /** The lead-qualifier graph with its normalise step made to throw, so a run of it fails. */
  function failing(graph: unknown): FlowGraph {
    const g = structuredClone(graph as FlowGraph);
    (g.nodes.find((n) => n.id === "normalise")!.data.config as { expression: string }).expression = '$error("boom")';
    return g;
  }
  async function runToEnd(user: CurrentUser, flowId: string) {
    const run = await enqueueRun(user, flowId);
    await claimAndProcess(run.id);
    return freshRun(run.id);
  }
  /** Claims `target` for `worker` without processing it; runs queued before it are processed first. */
  const claimOnly = (target: string, worker: string) =>
    claimUntil({ table: "run", targetId: target, claim: (w) => claimNextRun(db, w), process: (id, w) => (id === target ? Promise.resolve() : processRun(db, id, w)), workerId: () => worker });
  const rowOf = async (workspaceId: string, flowId: string) => (await listFlows(workspaceId)).find((f) => f.id === flowId)!;

  it("GET /api/v1/flows counts a run from before publishing v3 and a succeeded run after it, with lastRunAt = when that run finished", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Spans") });
    await publishFlow(user, flow.id); // v1
    await publishFlow(user, flow.id); // v2
    await save(user, flow.id, { baseRevision: 1, graph: failing(flow.graph) });
    const before = await runToEnd(user, flow.id);
    expect(before.status).toBe("failed");
    await save(user, flow.id, { baseRevision: 2, graph: flow.graph as FlowGraph });
    await publishFlow(user, flow.id); // v3
    const after = await runToEnd(user, flow.id);
    expect(after.status).toBe("succeeded");
    expect(after.flowVersionId).not.toBe(before.flowVersionId); // the two runs ran different revisions

    expect((await v1Flows(user, ws.id)).find((f) => f.id === flow.id)).toMatchObject({
      runCount: 2,
      lastRunStatus: "succeeded",
      lastRunAt: after.finishedAt!.toISOString(),
      publishedVersion: 3,
      paused: false,
    });
    const listed = await rowOf(ws.id, flow.id);
    expect(listed).toMatchObject({ runCount: 2, lastRunStatus: "succeeded", successRate: 0.5, publishedVersion: 3 });
    expect(listed.lastRunAt).toEqual(after.finishedAt);
  });

  it("lists a flow that never ran with runCount 0 and null lastRunStatus and lastRunAt in GET /api/v1/flows and the flow list", async () => {
    const { user, ws } = await setup();
    const idle = await createFlow(user, ws.id, { name: unique("Idle") });
    expect((await v1Flows(user, ws.id)).find((f) => f.id === idle.id)).toMatchObject({ runCount: 0, lastRunStatus: null, lastRunAt: null, publishedVersion: null });
    expect(await rowOf(ws.id, idle.id)).toMatchObject({ runCount: 0, lastRunStatus: null, lastRunAt: null, successRate: null });
  });

  it("the last run is the run that finished last, even when a newer run finished before it", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Overlap") });
    const older = await enqueueRun(user, flow.id);
    await save(user, flow.id, { baseRevision: 1, graph: failing(flow.graph) });
    const newer = await enqueueRun(user, flow.id);
    // One worker takes the older run and is still busy with it while the newer run is processed and fails.
    const worker = unique("worker");
    await claimOnly(older.id, worker);
    await claimAndProcess(newer.id);
    await processRun(db, older.id, worker);
    const [o, n] = [await freshRun(older.id), await freshRun(newer.id)];
    expect([o.status, n.status]).toEqual(["succeeded", "failed"]);
    expect(o.finishedAt!.getTime()).toBeGreaterThan(n.finishedAt!.getTime());

    const row = await rowOf(ws.id, flow.id);
    expect(row).toMatchObject({ runCount: 2, lastRunStatus: "succeeded" });
    expect(row.lastRunAt).toEqual(o.finishedAt);
  });

  it("a run in flight is the last run only until a run of the flow finishes; a running run ranks ahead of a queued one", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("In flight") });
    const older = await enqueueRun(user, flow.id);
    const newer = await enqueueRun(user, flow.id);
    const worker = unique("worker");
    let queued: { id: string } | null = null;
    try {
      // Nothing has finished: the newest started run is the last run, and a queued run (no startedAt) ranks after it.
      await claimOnly(older.id, worker);
      await claimOnly(newer.id, worker);
      queued = await enqueueRun(user, flow.id);
      const running = await freshRun(newer.id);
      expect(running.status).toBe("running");
      let row = await rowOf(ws.id, flow.id);
      expect(row).toMatchObject({ runCount: 3, lastRunStatus: "running" });
      expect(row.lastRunAt).toEqual(running.startedAt);

      // Once the older run finishes it is the last run, although the newer run is still running and one is still queued.
      await processRun(db, older.id, worker);
      const done = await freshRun(older.id);
      expect([done.status, (await freshRun(newer.id)).status, (await freshRun(queued.id)).status]).toEqual(["succeeded", "running", "queued"]);
      row = await rowOf(ws.id, flow.id);
      expect(row).toMatchObject({ runCount: 3, lastRunStatus: "succeeded" });
      expect(row.lastRunAt).toEqual(done.finishedAt);
    } finally {
      // Leave nothing queued or running for the tests after this one.
      for (const id of [older.id, newer.id, queued?.id]) {
        const status = id ? (await freshRun(id)).status : null;
        if (status === "running") await processRun(db, id!, worker);
        else if (status === "queued") await claimAndProcess(id!);
      }
    }
  });

  it("pausing a flow keeps runCount, lastRunStatus and lastRunAt and reports the pause in GET /api/v1/flows and the flow list", async () => {
    const { user, ws } = await setup();
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Paused") });
    const run = await runToEnd(user, flow.id);
    const summary = async () => {
      const { runCount, lastRunStatus, lastRunAt, pausedReason } = await rowOf(ws.id, flow.id);
      return { runCount, lastRunStatus, lastRunAt, pausedReason };
    };
    expect(await summary()).toEqual({ runCount: 1, lastRunStatus: "succeeded", lastRunAt: run.finishedAt, pausedReason: null });
    // A broken connection pauses the flows that use it (pauseFlowsUsingConnection writes this reason).
    await db.update(schema.flow).set({ pausedReason: "connection:x:expired", pausedAt: new Date() }).where(eq(schema.flow.id, flow.id));
    expect(await summary()).toEqual({ runCount: 1, lastRunStatus: "succeeded", lastRunAt: run.finishedAt, pausedReason: "connection:x:expired" });
    expect((await v1Flows(user, ws.id)).find((f) => f.id === flow.id)).toMatchObject({ runCount: 1, lastRunStatus: "succeeded", lastRunAt: run.finishedAt!.toISOString(), paused: true });
  });
});
