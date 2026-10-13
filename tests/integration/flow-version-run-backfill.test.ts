import { readFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createFlow, listFlows, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

afterAll(closeDb);

/** Legacy backfill for run snapshots (#205, follow-up of #204 / #117). */
const UP = "0026_flow_version_run_backfill.sql";
const REVERSE = "reverse/0026_flow_version_run_backfill.sql";

/** Runs one SQL file the way drizzle's migrator does: every statement of the file inside one transaction. psql meta-commands (`\set …`) are skipped. */
async function apply(file: string) {
  const text = readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), "utf8").replace(/^\\.*$/gm, "");
  await db.transaction(async (tx) => {
    for (const statement of text.split("--> statement-breakpoint")) if (statement.trim()) await tx.execute(sql.raw(statement));
  });
}

const touchedFlows: string[] = [];

// The reverse step is global; drop this file's backup rows so a later run never restores numbers it does not own.
afterEach(async () => {
  for (const flowId of touchedFlows.splice(0)) {
    await db.execute(sql`delete from flow_version_run_number_backup b using flow_version v where v.id = b.flow_version_id and v.flow_id = ${flowId}`);
  }
});

/** Legacy-shaped rows, as a pre-#204 image writes them (also after a rollback past 0025): save v1, then two runs whose snapshots took v2 and v3. */
async function legacyFlow() {
  const user = await makeUser("backfill");
  const ws = await createWorkspace(user, unique("Backfill"));
  const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Legacy") });
  touchedFlows.push(flow.id);
  const saved = await saveFlow(user, flow.id, { baseRevision: flow.revision, createVersion: true });
  const legacy = { flowId: flow.id, revision: saved.flow.revision, name: flow.name, graph: flow.graph, reason: "run", createdBy: user.id };
  // Pre-#204 rows predate the insert trigger from 0026; ALTER TABLE locks the table, so no other session sees it off.
  const runs = await db.transaction(async (tx) => {
    await tx.execute(sql`alter table flow_version disable trigger flow_version_run_unnumbered`);
    const rows = await tx.insert(schema.flowVersion).values([{ ...legacy, version: 2 }, { ...legacy, version: 3 }]).returning();
    await tx.execute(sql`alter table flow_version enable trigger flow_version_run_unnumbered`);
    return rows;
  });
  return { user, ws, flow, save: saved.version!, runs };
}

async function numbers(flowId: string) {
  const rows = await db.select({ id: schema.flowVersion.id, version: schema.flowVersion.version }).from(schema.flowVersion).where(eq(schema.flowVersion.flowId, flowId));
  return new Map(rows.map((r) => [r.id, r.version]));
}

async function backup(flowId: string) {
  const { rows } = await db.execute<{ id: string; version: number }>(
    sql`select b.flow_version_id as id, b.version from flow_version_run_number_backup b join flow_version v on v.id = b.flow_version_id where v.flow_id = ${flowId} order by b.version`,
  );
  return rows.map((r) => [r.id, r.version]);
}

async function hasRunTrigger() {
  const { rows } = await db.execute(sql`select 1 from pg_trigger where tgname = 'flow_version_run_unnumbered'`);
  return rows.length === 1;
}

/** The immutability trigger (0002) must be back on after every step. */
async function expectImmutable(id: string) {
  await expect(db.update(schema.flowVersion).set({ name: "changed" }).where(eq(schema.flowVersion.id, id))).rejects.toThrow();
}

describe("migration 0026: legacy run snapshots lose their number (#205)", () => {
  it("nulls numbered run snapshots, keeps saves, backs up the old numbers and the next publication fills the gap", async () => {
    const { user, ws, flow, save, runs } = await legacyFlow();

    await apply(UP);

    const after = await numbers(flow.id);
    expect(after.get(save.id)).toBe(1);
    expect(runs.map((r) => after.get(r.id))).toEqual([null, null]);
    expect(await backup(flow.id)).toEqual(runs.map((r) => [r.id, r.version]));
    await expectImmutable(runs[0].id);

    // The flows list field this fixes: the first publication of a legacy flow is v2, not v4.
    expect((await publishFlow(user, flow.id)).version).toBe(2);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(2);
  });

  it("can run twice: the second run changes nothing and keeps the first backup", async () => {
    const { flow, save, runs } = await legacyFlow();

    await apply(UP);
    const first = { numbers: await numbers(flow.id), backup: await backup(flow.id) };
    await apply(UP);

    expect(await numbers(flow.id)).toEqual(first.numbers);
    expect(await backup(flow.id)).toEqual(first.backup);
    expect((await numbers(flow.id)).get(save.id)).toBe(1);
    expect(first.backup).toHaveLength(runs.length);
    await expectImmutable(save.id);
  });

  it("is reversible: the reverse step restores the original numbers, can also run twice, and the backfill applies again", async () => {
    const { flow, save, runs } = await legacyFlow();
    const before = await numbers(flow.id);

    // Run by hand with psql: the file itself stops at the first error, so a failed reverse cannot exit 0.
    expect(readFileSync(new URL(`../../drizzle/${REVERSE}`, import.meta.url), "utf8").split("\n")[0]).toBe("\\set ON_ERROR_STOP on");

    await apply(UP);
    await apply(REVERSE);
    expect(await numbers(flow.id)).toEqual(before);
    expect(await hasRunTrigger()).toBe(false);
    await apply(REVERSE);
    expect(await numbers(flow.id)).toEqual(before);
    await expectImmutable(runs[1].id);

    await apply(UP);
    const again = await numbers(flow.id);
    expect(again.get(save.id)).toBe(1);
    expect(runs.map((r) => again.get(r.id))).toEqual([null, null]);
    expect(await hasRunTrigger()).toBe(true);
  });

  it("keeps run snapshots unnumbered when the previous image (after a rollback) still numbers them", async () => {
    const { user, ws, flow } = await legacyFlow();
    await apply(UP);

    // What the previous image's insertVersion writes for a run: the next number in the flow's sequence.
    const [run] = await db
      .insert(schema.flowVersion)
      .values({ flowId: flow.id, version: 4, revision: flow.revision, name: flow.name, graph: flow.graph, reason: "run", createdBy: user.id })
      .returning();

    expect(run.version).toBeNull();
    expect((await publishFlow(user, flow.id)).version).toBe(2);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(2);
  });

  it("refuses to reverse when a later publication took a freed number, and leaves every row as it was", async () => {
    const { user, flow, runs } = await legacyFlow();
    await apply(UP);
    const published = await publishFlow(user, flow.id); // takes v2, which run snapshot runs[0] held before the backfill
    expect(published.version).toBe(2);
    const migrated = await numbers(flow.id);

    await expect(apply(REVERSE)).rejects.toThrow();

    expect(await numbers(flow.id)).toEqual(migrated);
    expect(runs.map((r) => migrated.get(r.id))).toEqual([null, null]);
    await expectImmutable(published.versionId);
  });
});
