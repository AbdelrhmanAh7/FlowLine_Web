import { readFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, schema } from "@/db";
import { createFlow, listFlows } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";
import { blockedByObserver, connect, pauseAfter, routeTransactions } from "./pg-lock-helpers";

afterAll(closeDb);

/** Legacy backfill for non-publication snapshots (#205, follow-up of #204 / #117). */
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
    await db.execute(sql`delete from flow_version_number_backup b using flow_version v where v.id = b.flow_version_id and v.flow_id = ${flowId}`);
  }
});

/**
 * Legacy-shaped rows, as a pre-#204 image writes them (also after a rollback past 0025): publication v1, then a save,
 * a run and an overwrite snapshot that took v2, v3 and v4 from the same sequence.
 */
async function legacyFlow() {
  const user = await makeUser("backfill");
  const ws = await createWorkspace(user, unique("Backfill"));
  const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Legacy") });
  touchedFlows.push(flow.id);
  const published = await publishFlow(user, flow.id);
  expect(published.version).toBe(1);
  const legacy = { flowId: flow.id, revision: flow.revision, name: flow.name, graph: flow.graph, createdBy: user.id };
  // Pre-#204 rows predate the insert trigger from 0026; ALTER TABLE locks the table, so no other session sees it off.
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`alter table flow_version disable trigger flow_version_unpublished_unnumbered`);
    const inserted = await tx
      .insert(schema.flowVersion)
      .values([
        { ...legacy, version: 2, reason: "save" },
        { ...legacy, version: 3, reason: "run" },
        { ...legacy, version: 4, reason: "overwrite" },
      ])
      .returning();
    await tx.execute(sql`alter table flow_version enable trigger flow_version_unpublished_unnumbered`);
    return inserted;
  });
  return { user, ws, flow, publication: published.versionId, rows };
}

async function numbers(flowId: string) {
  const rows = await db.select({ id: schema.flowVersion.id, version: schema.flowVersion.version }).from(schema.flowVersion).where(eq(schema.flowVersion.flowId, flowId));
  return new Map(rows.map((r) => [r.id, r.version]));
}

async function backup(flowId: string) {
  const { rows } = await db.execute<{ id: string; version: number }>(
    sql`select b.flow_version_id as id, b.version from flow_version_number_backup b join flow_version v on v.id = b.flow_version_id where v.flow_id = ${flowId} order by b.version`,
  );
  return rows.map((r) => [r.id, r.version]);
}

async function hasRunTrigger() {
  const { rows } = await db.execute(sql`select 1 from pg_trigger where tgname = 'flow_version_unpublished_unnumbered'`);
  return rows.length === 1;
}

/** The immutability trigger (0002) must be back on after every step. */
async function expectImmutable(id: string) {
  await expect(db.update(schema.flowVersion).set({ name: "changed" }).where(eq(schema.flowVersion.id, id))).rejects.toThrow();
}

describe("migration 0026: legacy save, run and overwrite snapshots lose their number (#205)", () => {
  it("blocks legacy inserts between backup and update, so no number is cleared without a backup", async () => {
    const { flow, publication, rows } = await legacyFlow();
    await apply(REVERSE); // A previous image has no insert trigger yet.
    const migration = await connect();
    const writer = await connect();
    const route = routeTransactions();
    const pause = pauseAfter(migration, /INSERT INTO "flow_version_number_backup"/i);
    let running: Promise<void> | undefined;
    let inserting: Promise<unknown> | undefined;
    try {
      running = route.run(drizzle(migration, { schema }), () => apply(UP));
      void running.catch(() => {});
      await pause.reached;
      const { rows: [{ pid }] } = await writer.query<{ pid: number }>("select pg_backend_pid() as pid");
      let finished = false;
      inserting = writer.query(`insert into flow_version (id, flow_id, version, revision, name, graph, reason, created_by)
        select gen_random_uuid(), flow_id, 8, revision, name, graph, 'run', created_by
        from flow_version where id = $1 returning id, version`, [publication]).then((result) => {
        finished = true;
        return result;
      }, (error) => { finished = true; throw error; });
      void inserting.catch(() => {});
      expect((await blockedByObserver(migration, pid, () => finished)).query).toMatch(/insert into flow_version/i);
      pause.resume();
      await Promise.all([running, inserting]);
      const after = await numbers(flow.id);
      expect(after.size).toBe(rows.length + 2); // Publication, three legacy rows and the concurrent insert.
      expect(after.get(publication)).toBe(1);
      expect([...after.entries()].filter(([id]) => id !== publication).every(([, number]) => number === null)).toBe(true);
      expect(await backup(flow.id)).toEqual(rows.map((row) => [row.id, row.version]));
      await apply(REVERSE);
      const restored = await numbers(flow.id);
      expect(rows.map((row) => restored.get(row.id))).toEqual([2, 3, 4]);
    } finally {
      pause.resume();
      await Promise.allSettled([running, inserting]);
      pause.restore();
      route.restore();
      await migration.end();
      await writer.end();
      await apply(UP); // Leave the database's insert guard enabled for the next test.
    }
  });

  it("nulls numbered save, run and overwrite snapshots, keeps the publication, backs up the old numbers", async () => {
    const { user, ws, flow, publication, rows } = await legacyFlow();
    await apply(REVERSE);
    await db.execute(sql`drop table flow_version_number_backup`); // Actual pre-0026 schema: no backup table yet.
    await apply(UP);

    const after = await numbers(flow.id);
    expect(after.get(publication)).toBe(1);
    expect(rows.map((r) => after.get(r.id))).toEqual([null, null, null]);
    expect(await backup(flow.id)).toEqual(rows.map((r) => [r.id, r.version]));
    await expectImmutable(rows[0].id);

    // The flows list field this fixes: the next publication of a legacy flow is v2, not v5.
    expect((await publishFlow(user, flow.id)).version).toBe(2);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(2);
  });

  it("can run twice: the second run changes nothing and keeps the first backup", async () => {
    const { flow, publication, rows } = await legacyFlow();

    await apply(UP);
    const first = { numbers: await numbers(flow.id), backup: await backup(flow.id) };
    await apply(UP);

    expect(await numbers(flow.id)).toEqual(first.numbers);
    expect(await backup(flow.id)).toEqual(first.backup);
    expect((await numbers(flow.id)).get(publication)).toBe(1);
    expect(first.backup).toHaveLength(rows.length);
    await expectImmutable(publication);
  });

  it("is reversible: the reverse step restores the original numbers, can also run twice, and the backfill applies again", async () => {
    const { flow, publication, rows } = await legacyFlow();
    const before = await numbers(flow.id);

    // Run by hand with psql: the file itself stops at the first error, so a failed reverse cannot exit 0.
    expect(readFileSync(new URL(`../../drizzle/${REVERSE}`, import.meta.url), "utf8").split("\n")[0]).toBe("\\set ON_ERROR_STOP on");

    await apply(UP);
    await apply(REVERSE);
    expect(await numbers(flow.id)).toEqual(before);
    expect(await hasRunTrigger()).toBe(false);
    await apply(REVERSE);
    expect(await numbers(flow.id)).toEqual(before);
    await expectImmutable(rows[1].id);

    await apply(UP);
    const again = await numbers(flow.id);
    expect(again.get(publication)).toBe(1);
    expect(rows.map((r) => again.get(r.id))).toEqual([null, null, null]);
    expect(await hasRunTrigger()).toBe(true);
  });

  it("keeps save, run and overwrite snapshots unnumbered when the previous image (after a rollback) still numbers them", async () => {
    const { user, ws, flow } = await legacyFlow();
    await apply(UP);

    // What the previous image's insertVersion writes: the next numbers in the flow's sequence.
    const base = { flowId: flow.id, revision: flow.revision, name: flow.name, graph: flow.graph, createdBy: user.id };
    const inserted = await db
      .insert(schema.flowVersion)
      .values([
        { ...base, version: 5, reason: "save" },
        { ...base, version: 6, reason: "run" },
        { ...base, version: 7, reason: "overwrite" },
      ])
      .returning();

    expect(inserted.map((r) => r.version)).toEqual([null, null, null]);
    expect((await publishFlow(user, flow.id)).version).toBe(2);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(2);
  });

  it("refuses to reverse when a later publication took a freed number, and leaves every row as it was", async () => {
    const { user, flow, rows } = await legacyFlow();
    await apply(UP);
    const published = await publishFlow(user, flow.id); // takes v2, which the save snapshot rows[0] held before the backfill
    expect(published.version).toBe(2);
    const migrated = await numbers(flow.id);

    await expect(apply(REVERSE)).rejects.toThrow();

    expect(await numbers(flow.id)).toEqual(migrated);
    expect(rows.map((r) => migrated.get(r.id))).toEqual([null, null, null]);
    await expectImmutable(published.versionId);
  });
});
