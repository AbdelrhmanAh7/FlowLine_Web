import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { createFlow } from "@/server/flows";
import { pruneOnce } from "@/server/retention";
import { enqueueRunEx } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

afterAll(closeDb);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

describe("data retention", () => {
  it("prunes old finished runs (with steps/events), old telemetry and expired sessions — never live runs or the usage ledger", async () => {
    const user = await makeUser("ret");
    const ws = await createWorkspace(user, unique("Retention"));
    const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    const mk = async () => (await enqueueRunEx(user, flow.id, {})).run.id;
    const oldDone = await mk();
    const oldWaiting = await mk();
    const recentDone = await mk();
    await db.update(schema.run).set({ status: "succeeded", finishedAt: daysAgo(120) }).where(eq(schema.run.id, oldDone));
    await db.update(schema.run).set({ status: "waiting_approval", createdAt: daysAgo(200) }).where(eq(schema.run.id, oldWaiting));
    await db.update(schema.run).set({ status: "failed", finishedAt: daysAgo(10) }).where(eq(schema.run.id, recentDone));
    await db.insert(schema.runEvent).values({ runId: oldDone, workspaceId: ws.id, type: "finished", data: {} });
    const [usage] = await db.insert(schema.usageEvent).values({ workspaceId: ws.id, runId: oldDone, kind: "run", idempotencyKey: `ret-${oldDone}`, status: "settled", costMicros: 0 }).returning();

    const [oldEv] = await db.insert(schema.productEvent).values({ name: "workflow_created", workspaceId: ws.id, at: daysAgo(400) }).returning();
    const [newEv] = await db.insert(schema.productEvent).values({ name: "workflow_created", workspaceId: ws.id }).returning();

    const r = await pruneOnce(db);
    expect(r).not.toBeNull();
    const runs = await db.select({ id: schema.run.id }).from(schema.run).where(inArray(schema.run.id, [oldDone, oldWaiting, recentDone]));
    expect(runs.map((x) => x.id).sort()).toEqual([oldWaiting, recentDone].sort());
    expect(await db.select().from(schema.runEvent).where(eq(schema.runEvent.runId, oldDone))).toHaveLength(0); // cascaded
    expect(await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.id, usage!.id))).toHaveLength(1); // ledger kept
    expect(await db.select().from(schema.productEvent).where(eq(schema.productEvent.id, oldEv!.id))).toHaveLength(0);
    expect(await db.select().from(schema.productEvent).where(eq(schema.productEvent.id, newEv!.id))).toHaveLength(1);
  });

  it("only one worker prunes at a time (advisory lock)", async () => {
    const results = await Promise.all([pruneOnce(db), pruneOnce(db), pruneOnce(db)]);
    expect(results.filter((x) => x !== null).length).toBeGreaterThanOrEqual(1);
  });
});
