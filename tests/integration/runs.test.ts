import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { createFlow, listFlows, saveFlow, softDeleteFlow } from "@/server/flows";
import { enqueueRun, getRunDetail, listRuns, rerunFromStep } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimNextRun, recoverStaleRuns, processRun } from "../../worker/runner";
import { claimAndProcess, closeDb, expectHttpError, freshRun, makeUser, unique } from "./helpers";

afterAll(closeDb);

const LEAD_ORDER = ["trigger", "normalise", "is-hot", "hot", "nurture"];
const HOT_LEAD = { name: "Ada Lovelace", domain: "analytical.io", tier: "hot" };

async function setup(templateId = "lead-qualifier") {
  const user = await makeUser("run");
  const ws = await createWorkspace(user, unique("Runs"));
  const flow = await createFlow(user, ws.id, { templateId, name: unique("Runnable") });
  return { user, ws, flow };
}

async function stepsOf(runId: string) {
  return db.select().from(schema.runStep).where(eq(schema.runStep.runId, runId)).orderBy(asc(schema.runStep.position));
}

describe("enqueueRun validation", () => {
  it("rejects an empty flow with 422 INVALID_FLOW and issues", async () => {
    const user = await makeUser("run-empty");
    const ws = await createWorkspace(user, unique("Empty runs"));
    const blank = await createFlow(user, ws.id, { name: unique("Blank") });

    const err = await expectHttpError(enqueueRun(user, blank.id), 422, "INVALID_FLOW");
    const issues = err.details as { code: string }[];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.map((i) => i.code)).toContain("EMPTY_FLOW");

    // Nothing was persisted for the rejected run.
    expect(await listRuns(ws.id)).toEqual([]);
  });

  it("rejects a structurally invalid graph with 422", async () => {
    const { user, flow } = await setup();
    const broken = structuredClone(flow.graph as FlowGraph);
    // Disconnect the condition node: unconnected input + invalid edges downstream.
    broken.edges = broken.edges.filter((e) => e.target !== "is-hot" && e.source !== "is-hot");
    await saveFlow(user, flow.id, { baseRevision: 1, graph: broken });

    const err = await expectHttpError(enqueueRun(user, flow.id), 422, "INVALID_FLOW");
    const issues = err.details as { code: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.code)).toContain("UNCONNECTED_INPUT");
  });

  it("404s for a soft-deleted or unknown flow", async () => {
    const { user, flow } = await setup();
    await expectHttpError(enqueueRun(user, crypto.randomUUID()), 404, "NOT_FOUND");
    await softDeleteFlow(flow.id);
    await expectHttpError(enqueueRun(user, flow.id), 404, "NOT_FOUND");
  });
});

describe("enqueueRun", () => {
  it("queues runs with per-workspace numbers and pending steps in topo order", async () => {
    const { user, ws, flow } = await setup();

    const run1 = await enqueueRun(user, flow.id);
    const run2 = await enqueueRun(user, flow.id);
    expect(run1.status).toBe("queued");
    expect(run1.number).toBe(1);
    expect(run2.number).toBe(2);

    // Read back fresh — numbers are workspace-scoped and unique.
    expect((await freshRun(run1.id)).number).toBe(1);
    expect((await freshRun(run2.id)).number).toBe(2);
    expect((await freshRun(run1.id)).workspaceId).toBe(ws.id);

    // A "run" version snapshot was pinned.
    const [version] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, run1.flowVersionId));
    expect(version.reason).toBe("run");
    expect(version.revision).toBe(1);
    expect((version.graph as FlowGraph).nodes).toHaveLength(5);

    const steps = await stepsOf(run1.id);
    expect(steps.map((s) => s.nodeId)).toEqual(LEAD_ORDER);
    expect(steps.every((s) => s.status === "pending")).toBe(true);
    expect(steps.map((s) => s.position)).toEqual([0, 1, 2, 3, 4]);

    await claimAndProcess(run1.id);
    await claimAndProcess(run2.id);
  });
});

describe("processRun (worker)", () => {
  it("claims with SKIP LOCKED, executes, and persists a successful run", async () => {
    const { user, flow } = await setup();
    const run = await enqueueRun(user, flow.id);

    const claimed = await claimNextRun(db, unique("worker"));
    expect(claimed).toBe(run.id);
    const claimedRow = await freshRun(run.id);
    expect(claimedRow.status).toBe("running");
    expect(claimedRow.attempts).toBe(1);
    expect(claimedRow.lockedBy).not.toBeNull();
    expect(claimedRow.startedAt).not.toBeNull();

    await processRun(db, run.id, claimedRow.lockedBy!);

    // Everything below is re-read from the DB, not from return values.
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    expect(done.output).toEqual({ hot_lead: HOT_LEAD });
    expect(done.error).toBeNull();
    expect(done.finishedAt).not.toBeNull();
    expect(done.durationMs).not.toBeNull();
    expect(done.lockedBy).toBeNull();

    const steps = await stepsOf(run.id);
    expect(steps.map((s) => s.nodeId)).toEqual(LEAD_ORDER);
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "succeeded", "succeeded", "succeeded", "skipped"]);

    const byNode = new Map(steps.map((s) => [s.nodeId, s]));
    expect(byNode.get("trigger")!.output).toEqual({ lead: { name: "Ada Lovelace", email: "ada@analytical.io", employees: 120 } });
    expect(byNode.get("normalise")!.output).toEqual({ name: "Ada Lovelace", domain: "analytical.io", size: 120 });
    expect(byNode.get("is-hot")!.output).toEqual({ result: true, branch: "true" });
    expect(byNode.get("hot")!.output).toEqual(HOT_LEAD);
    // The condition forwards its input to the taken branch.
    expect(byNode.get("hot")!.input).toEqual(byNode.get("normalise")!.output);
    expect(byNode.get("nurture")!.skipReason).toContain("true");
    expect(byNode.get("nurture")!.output).toBeNull();
    for (const s of steps.filter((s) => s.status === "succeeded")) {
      expect(s.startedAt).not.toBeNull();
      expect(s.finishedAt).not.toBeNull();
    }

    const detail = await getRunDetail(run.id);
    expect(detail.status).toBe("succeeded");
    expect(detail.flowName).toBe(flow.name);
    expect(detail.version).toBe(1);
    expect(detail.steps).toHaveLength(5);
    expect((detail.graph as FlowGraph).nodes).toHaveLength(5);
  });

  it("fails the run when a node throws, records error.nodeId, and skips downstream", async () => {
    const { user, flow } = await setup();
    const broken = structuredClone(flow.graph as FlowGraph);
    (broken.nodes.find((n) => n.id === "normalise")!.data.config as { expression: string }).expression = '$error("boom")';
    await saveFlow(user, flow.id, { baseRevision: 1, graph: broken });

    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);

    const done = await freshRun(run.id);
    expect(done.status).toBe("failed");
    expect(done.error?.nodeId).toBe("normalise");
    expect(done.error?.message).toBeTruthy();
    expect(done.output).toEqual({});

    const steps = await stepsOf(run.id);
    const byNode = new Map(steps.map((s) => [s.nodeId, s]));
    expect(byNode.get("trigger")!.status).toBe("succeeded");
    expect(byNode.get("normalise")!.status).toBe("failed");
    expect(byNode.get("normalise")!.error?.message).toBeTruthy();
    expect(byNode.get("is-hot")!.status).toBe("skipped");
    expect(byNode.get("hot")!.status).toBe("skipped");
    expect(byNode.get("nurture")!.status).toBe("skipped");
  });
});

describe("rerunFromStep", () => {
  it("reuses upstream steps and re-executes from the chosen node", async () => {
    const { user, flow } = await setup();
    const original = await enqueueRun(user, flow.id);
    await claimAndProcess(original.id);
    expect((await freshRun(original.id)).status).toBe("succeeded");

    const rerun = await rerunFromStep(user, await freshRun(original.id), "is-hot");
    expect(rerun.rerunOfRunId).toBe(original.id);
    expect(rerun.rerunFromNodeId).toBe("is-hot");
    expect(rerun.status).toBe("queued");

    await claimAndProcess(rerun.id);

    const done = await freshRun(rerun.id);
    expect(done.status).toBe("succeeded");
    expect(done.output).toEqual({ hot_lead: HOT_LEAD });

    const steps = await stepsOf(rerun.id);
    const byNode = new Map(steps.map((s) => [s.nodeId, s]));
    expect(byNode.get("trigger")!.status).toBe("reused");
    expect(byNode.get("normalise")!.status).toBe("reused");
    expect(byNode.get("is-hot")!.status).toBe("succeeded");
    expect(byNode.get("hot")!.status).toBe("succeeded");
    expect(byNode.get("nurture")!.status).toBe("skipped");

    // Reused steps carried over the original run's persisted values.
    const originalSteps = new Map((await stepsOf(original.id)).map((s) => [s.nodeId, s]));
    expect(byNode.get("trigger")!.output).toEqual(originalSteps.get("trigger")!.output);
    expect(byNode.get("normalise")!.output).toEqual(originalSteps.get("normalise")!.output);
  });

  it("409s when the original run is still active", async () => {
    const { user, flow } = await setup();
    const queued = await enqueueRun(user, flow.id);
    await expectHttpError(rerunFromStep(user, await freshRun(queued.id), "is-hot"), 409, "RUN_ACTIVE");
    await claimAndProcess(queued.id); // drain
  });
});

describe("recoverStaleRuns", () => {
  it("requeues a running run whose heartbeat went stale", async () => {
    const { user, flow } = await setup();
    const run = await enqueueRun(user, flow.id);
    const claimed = await claimNextRun(db, unique("worker"));
    expect(claimed).toBe(run.id);
    expect((await freshRun(run.id)).status).toBe("running");

    // Simulate a dead worker: heartbeat 2 minutes in the past.
    await db
      .update(schema.run)
      .set({ heartbeatAt: new Date(Date.now() - 120_000) })
      .where(eq(schema.run.id, run.id));

    const recovered = await recoverStaleRuns(db);
    expect(recovered).toBeGreaterThanOrEqual(1);

    const row = await freshRun(run.id);
    expect(row.status).toBe("queued");
    expect(row.lockedBy).toBeNull();

    // The requeued run can be claimed and processed normally.
    await claimAndProcess(run.id);
    expect((await freshRun(run.id)).status).toBe("succeeded");
  });
});

describe("listRuns filters", () => {
  it("filters by status, q and flowId", async () => {
    const user = await makeUser("run-filter");
    const ws = await createWorkspace(user, unique("Filters"));
    const tag = randomTag();
    const alpha = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: `Alpha-${tag}` });
    const beta = await createFlow(user, ws.id, { templateId: "ticket-priority", name: `Beta-${tag}` });

    const run1 = await enqueueRun(user, alpha.id); // #1 -> processed to succeeded
    const run2 = await enqueueRun(user, alpha.id); // #2 -> stays queued
    const run3 = await enqueueRun(user, beta.id); // #3 -> stays queued
    await claimAndProcess(run1.id);
    expect((await freshRun(run1.id)).status).toBe("succeeded");

    const all = await listRuns(ws.id);
    expect(all.map((r) => r.number).sort()).toEqual([1, 2, 3]);
    expect(all.find((r) => r.id === run1.id)?.steps).toHaveLength(5);

    const succeeded = await listRuns(ws.id, { status: "succeeded" });
    expect(succeeded.map((r) => r.id)).toEqual([run1.id]);

    const failed = await listRuns(ws.id, { status: "failed" });
    expect(failed).toEqual([]);

    // "running" means active: queued + running.
    const active = await listRuns(ws.id, { status: "running" });
    expect(active.map((r) => r.id).sort()).toEqual([run2.id, run3.id].sort());

    // "#1" matches the per-workspace run number.
    const byNumber = await listRuns(ws.id, { q: "#1" });
    expect(byNumber.map((r) => r.id)).toEqual([run1.id]);

    // Plain text matches the flow name.
    const byName = await listRuns(ws.id, { q: `Alpha-${tag}` });
    expect(byName.map((r) => r.id).sort()).toEqual([run1.id, run2.id].sort());

    const byFlow = await listRuns(ws.id, { flowId: beta.id });
    expect(byFlow.map((r) => r.id)).toEqual([run3.id]);
    expect(byFlow[0].flowName).toBe(`Beta-${tag}`);
  });
});

function randomTag() {
  return Math.random().toString(36).slice(2, 10);
}

describe("listFlows per-flow run stats (regression: Codex CR-02)", () => {
  it("counts runs and success rate per flow from real run rows", async () => {
    const { user, ws, flow } = await setup();
    const other = await createFlow(user, ws.id, { templateId: "order-totals", name: unique("Other") });
    const ok1 = await enqueueRun(user, flow.id);
    await claimAndProcess(ok1.id);
    const ok2 = await enqueueRun(user, flow.id);
    await claimAndProcess(ok2.id);
    const broken = structuredClone(flow.graph as FlowGraph);
    (broken.nodes.find((n) => n.id === "normalise")!.data.config as { expression: string }).expression = '$error("boom")';
    await saveFlow(user, flow.id, { baseRevision: 1, graph: broken });
    const bad = await enqueueRun(user, flow.id);
    await claimAndProcess(bad.id);

    const rows = await listFlows(ws.id);
    const mine = rows.find((r) => r.id === flow.id)!;
    expect(mine.runCount).toBe(3);
    expect(mine.successRate).toBeCloseTo(2 / 3, 5);
    expect(mine.lastRunStatus).toBe("failed");
    expect(mine.nodeCount).toBe(5);
    expect(mine.hasTrigger).toBe(true);
    const untouched = rows.find((r) => r.id === other.id)!;
    expect(untouched.runCount).toBe(0);
    expect(untouched.successRate).toBeNull();
    expect(untouched.lastRunStatus).toBeNull();
  });
});

describe("worker lease (regression: Fable F1)", () => {
  it("a worker that lost its lease writes nothing", async () => {
    const { user, flow } = await setup();
    const run = await enqueueRun(user, flow.id);
    let claimed: string | null = null;
    for (let i = 0; i < 25 && claimed !== run.id; i++) {
      claimed = await claimNextRun(db, "worker-A");
      if (claimed && claimed !== run.id) await processRun(db, claimed, "worker-A");
    }
    expect(claimed).toBe(run.id);
    // Stale recovery handed the run to worker B meanwhile.
    await db.update(schema.run).set({ lockedBy: "worker-B" }).where(eq(schema.run.id, run.id));
    await processRun(db, run.id, "worker-A");
    const after = await freshRun(run.id);
    expect(after.status).toBe("running");
    expect(after.lockedBy).toBe("worker-B");
    expect((await stepsOf(run.id)).every((s) => s.status === "pending")).toBe(true);
    // Worker B finishes it normally.
    await processRun(db, run.id, "worker-B");
    expect((await freshRun(run.id)).status).toBe("succeeded");
  });

  it("stale recovery revokes the lease and the run completes once", async () => {
    const { user, flow } = await setup();
    const run = await enqueueRun(user, flow.id);
    await db.update(schema.run).set({ status: "running", lockedBy: "dead-worker", heartbeatAt: new Date(Date.now() - 120_000), attempts: 1 }).where(eq(schema.run.id, run.id));
    await recoverStaleRuns(db);
    await processRun(db, run.id, "dead-worker"); // the old worker wakes up: must be a no-op
    expect((await freshRun(run.id)).status).toBe("queued");
    await claimAndProcess(run.id);
    const done = await freshRun(run.id);
    expect(done.status).toBe("succeeded");
    expect(done.attempts).toBe(2);
  });

  it("run detail hides worker internals (regression: Fable F7)", async () => {
    const { user, flow } = await setup();
    const run = await enqueueRun(user, flow.id);
    await claimAndProcess(run.id);
    const detail = (await getRunDetail(run.id)) as Record<string, unknown>;
    expect(detail).not.toHaveProperty("lockedBy");
    expect(detail).not.toHaveProperty("attempts");
    expect(detail).not.toHaveProperty("heartbeatAt");
  });

  it("listRuns clamps nonsense limits (regression: Fable F5)", async () => {
    const { ws } = await setup();
    await expect(listRuns(ws.id, { limit: -1 })).resolves.toEqual([]);
    await expect(listRuns(ws.id, { limit: Number.NaN })).resolves.toEqual([]);
  });
});
