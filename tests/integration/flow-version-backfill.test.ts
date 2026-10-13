import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createFlow, listFlows, saveFlow } from "@/server/flows";
import { publishFlow } from "@/server/publish";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

afterAll(closeDb);

/**
 * Migration 0025 backfill: legacy run snapshots (written before the migration) keep their numeric versions,
 * which would make the first publication after deployment vN+1 instead of v1. The migration nulls them.
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

/** A flow as a pre-#204 database holds it: save v1, then two manual runs whose snapshots took v2 and v3. */
async function legacyFlow() {
  const user = await makeUser("backfill");
  const ws = await createWorkspace(user, unique("Backfill"));
  const flow = await createFlow(user, ws.id, { templateId: "lead-qualifier", name: unique("Legacy") });
  const saved = await saveFlow(user, flow.id, { baseRevision: flow.revision, createVersion: true });
  const legacy = { flowId: flow.id, revision: saved.flow.revision, name: flow.name, graph: flow.graph, reason: "run", createdBy: user.id };
  const runs = await db.insert(schema.flowVersion).values([{ ...legacy, version: 2 }, { ...legacy, version: 3 }]).returning();
  return { user, ws, flow, save: saved.version!, runs };
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

describe("migration 0025 backfill: legacy run snapshots lose their number (#204)", () => {
  it("nulls numbered run snapshots, keeps saves, and the next publication fills the gap", async () => {
    const { user, ws, flow, save, runs } = await legacyFlow();

    await applyBackfill();

    const after = await numbers(flow.id);
    expect(after.get(save.id)).toBe(1);
    expect(runs.map((r) => after.get(r.id))).toEqual([null, null]);
    await expectImmutable(runs[0].id);

    // The flows list field this fixes: the first publication of a legacy flow is v2, not v4.
    expect((await publishFlow(user, flow.id)).version).toBe(2);
    expect((await listFlows(ws.id)).find((r) => r.id === flow.id)!.publishedVersion).toBe(2);
  });

  it("keeps the immutability trigger on", async () => {
    await applyBackfill();
    expect(await hasImmutabilityTrigger()).toBe(true);
  });
});
