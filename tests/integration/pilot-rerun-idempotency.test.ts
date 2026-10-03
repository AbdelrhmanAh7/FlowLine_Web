import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createFlow } from "@/server/flows";
import { enqueueRun, rerunFromStep } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

afterAll(closeDb);

async function setup() {
  const user = await makeUser("pilot-rerun");
  const workspace = await createWorkspace(user, unique("Pilot retry"));
  const flow = await createFlow(user, workspace.id, { templateId: "lead-qualifier", name: unique("Retry") });
  const queued = await enqueueRun(user, flow.id);
  await claimAndProcess(queued.id);
  const original = await freshRun(queued.id);
  expect(original.status).toBe("succeeded");
  return { user, workspace, original };
}

describe("paid pilot rerun request identity", () => {
  it("concurrent submissions and a lost-response retry create one run and one execution event", async () => {
    const { user, workspace, original } = await setup();
    const submit = () => rerunFromStep(user, original, "is-hot", "original", "pilot-retry-001");
    const [first, concurrent] = await Promise.all([submit(), submit()]);
    expect(concurrent.id).toBe(first.id);
    await claimAndProcess(first.id);
    const retry = await submit();
    expect(retry.id).toBe(first.id);
    expect(retry.status).toBe("succeeded");
    expect((await freshRun(first.id)).output).toEqual(original.output);
    const reruns = await db.select().from(schema.run).where(eq(schema.run.rerunOfRunId, original.id));
    expect(reruns.map((r) => r.id)).toEqual([first.id]);
    const executionEvents = await db.select().from(schema.usageEvent).where(and(eq(schema.usageEvent.workspaceId, workspace.id), eq(schema.usageEvent.kind, "execution")));
    expect(executionEvents.map((event) => event.runId).sort()).toEqual([original.id, first.id].sort());
  });

  it("a new request, a different step, or a different revision remains a distinct rerun", async () => {
    const { user, original } = await setup();
    const otherQueued = await enqueueRun(user, original.flowId);
    await claimAndProcess(otherQueued.id);
    const other = await freshRun(otherQueued.id);
    const a = await rerunFromStep(user, original, "is-hot", "original", "pilot-intent-001");
    const b = await rerunFromStep(user, original, "is-hot", "original", "pilot-intent-002");
    const c = await rerunFromStep(user, original, "normalise", "original", "pilot-intent-001");
    const d = await rerunFromStep(user, original, "is-hot", "latest", "pilot-intent-001");
    const e = await rerunFromStep(user, other, "is-hot", "original", "pilot-intent-001");
    expect(new Set([a.id, b.id, c.id, d.id, e.id]).size).toBe(5);
    for (const run of [a, b, c, d, e]) await claimAndProcess(run.id);
  });
});
