import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createFlow, listFlows } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

afterAll(closeDb);

/**
 * Migration 0025 backfill: legacy save, overwrite and run snapshots (written before the migration) keep their numeric
 * versions, which would make the next publication after deployment skip numbers. The migration nulls every
 * non-publication number and keeps published numbers as they are.
 */
const MIGRATION = "0025_flow_version_run_unnumbered.sql";

/** Extracts the backfill statements (DROP TRIGGER, UPDATE, CREATE TRIGGER) from the migration SQL. */
function backfillStatements(): string[] {
  const text = readFileSync(new URL(`../../drizzle/${MIGRATION}`, import.meta.url), "utf8");
  const statements = text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^--.*$/gm, "").trim())
    .filter(Boolean);
  const dropIdx = statements.findIndex((s) => s.startsWith("DROP TRIGGER"));
  const createIdx = statements.findIndex((s) => s.startsWith("CREATE TRIGGER"));
  expect(dropIdx).toBeGreaterThanOrEqual(0);
  expect(createIdx).toBeGreaterThan(dropIdx);
  return statements.slice(dropIdx, createIdx + 1);
}

/** Runs the backfill statements the way drizzle's migrator does: every statement inside one transaction. */
async function applyBackfill() {
  await db.transaction(async (tx) => {
    for (const statement of backfillStatements()) await tx.execute(sql.raw(statement));
  });
}

/** A flow as a pre-#204 database holds it: two manual runs whose snapshots took v1 and v2, never published. */
async function legacyFlow() {
  const user = await makeUser("backfill");
  const ws = await createWorkspace(user, unique("Backfill"));
  const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Legacy") });
  const legacy = { flowId: flow.id, revision: flow.revision, name: flow.name, graph: flow.graph, reason: "run", createdBy: user.id };
  const runs = await db.insert(schema.flowVersion).values([{ ...legacy, version: 1 }, { ...legacy, version: 2 }]).returning();
  return { user, ws, flow, runs };
}

async function numbers(flowId: string) {
  const rows = await db.select({ id: schema.flowVersion.id, version: schema.flowVersion.version }).from(schema.flowVersion).where(eq(schema.flowVersion.flowId, flowId));
  return new Map(rows.map((r) => [r.id, r.version]));
}

async function hasImmutabilityTrigger() {
  const { rows } = await db.execute(sql`select 1 from pg_trigger where tgname = 'flow_version_no_update'`);
  return rows.length === 1;
}

/** The immutability trigger (0002) must be back on after the backfill. */
async function expectImmutable(id: string) {
  await expect(db.update(schema.flowVersion).set({ name: "changed" }).where(eq(schema.flowVersion.id, id))).rejects.toThrow();
}

describe("migration 0025 backfill: only publications keep their number (#204)", () => {
  it("nulls numbered run snapshots, so the first publication after two legacy runs is v1", async () => {
    const { user, ws, flow, runs } = await legacyFlow();

    await applyBackfill();

    const after = await numbers(flow.id);
    expect(runs.map((r) => after.get(r.id))).toEqual([null, null]);
    await expectImmutable(runs[0].id);

    // The flows list field this fixes: without the backfill this publication would be v3.
    expect((await publishFlow(user, flow.id)).version).toBe(1);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(1);
  });

  it("nulls legacy save and overwrite numbers, keeps the published number and its subflow reference", async () => {
    const { user, ws, flow } = await legacyFlow();
    const base = { flowId: flow.id, revision: flow.revision, name: flow.name, graph: flow.graph, createdBy: user.id };
    const rows = await db
      .insert(schema.flowVersion)
      .values([
        { ...base, version: 3, reason: "save" },
        { ...base, version: 4, reason: "publish" },
        { ...base, version: 5, reason: "overwrite" },
      ])
      .returning();

    await applyBackfill();

    const after = await numbers(flow.id);
    expect(rows.map((r) => after.get(r.id))).toEqual([null, 4, null]);
    // A subflow step pins the published number; it still resolves to the same publication.
    const [pinned] = await db.select({ id: schema.flowVersion.id }).from(schema.flowVersion).where(and(eq(schema.flowVersion.flowId, flow.id), eq(schema.flowVersion.version, 4)));
    expect(pinned.id).toBe(rows[1].id);
    expect((await publishFlow(user, flow.id)).version).toBe(5);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(5);
  });

  it("keeps the immutability trigger on", async () => {
    await applyBackfill();
    expect(await hasImmutabilityTrigger()).toBe(true);
  });
});
