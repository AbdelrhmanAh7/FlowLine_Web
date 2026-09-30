import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CompanyBlueprint } from "@/company-builder/model";
import { composeBlueprint } from "@/company-builder/planner";
import { validateBlueprint } from "@/company-builder/validate";
import type { CurrentUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { canonicalJson } from "@/server/crypto";
import { HttpError, notFound } from "@/server/http";
import { requireSession, snapshotProfile, stateOf } from "./sessions";

export type BlueprintRow = typeof schema.cbBlueprint.$inferSelect;

export interface BlueprintDiff {
  addedTasks: string[];
  removedTasks: string[];
  changedTasks: string[];
  addedBlockers: string[];
  removedBlockers: string[];
}

export function diffBlueprints(prev: CompanyBlueprint | null, next: CompanyBlueprint): BlueprintDiff {
  const pt = new Map((prev?.tasks ?? []).map((t) => [t.id, canonicalJson(t)]));
  const nt = new Map(next.tasks.map((t) => [t.id, canonicalJson(t)]));
  const key = (b: CompanyBlueprint["blockers"][number]) => `${b.code}:${b.department ?? ""}:${Object.values(b.params).join(",")}`;
  const pb = new Set((prev?.blockers ?? []).map(key));
  const nb = new Set(next.blockers.map(key));
  return {
    addedTasks: [...nt.keys()].filter((k) => !pt.has(k)),
    removedTasks: [...pt.keys()].filter((k) => !nt.has(k)),
    changedTasks: [...nt.keys()].filter((k) => pt.has(k) && pt.get(k) !== nt.get(k)),
    addedBlockers: [...nb].filter((k) => !pb.has(k)),
    removedBlockers: [...pb].filter((k) => !nb.has(k)),
  };
}

export async function workspaceConnections(workspaceId: string) {
  return db.select({ id: schema.connection.id, provider: schema.connection.provider, status: schema.connection.status }).from(schema.connection).where(eq(schema.connection.workspaceId, workspaceId));
}

export async function latestBlueprint(sessionId: string) {
  const [row] = await db.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId)).orderBy(desc(schema.cbBlueprint.version)).limit(1);
  return row ?? null;
}

/**
 * Stores a VALIDATED blueprint as the next version (unchanged body = the existing latest version is returned, so a
 * refresh or double click never creates duplicates). Model/CLI output reaches the DB only through this function.
 */
export async function storeBlueprint(user: CurrentUser, workspaceId: string, sessionId: string, body: unknown, generator: CompanyBlueprint["generator"]) {
  const { blueprint, issues } = validateBlueprint(body);
  if (!blueprint) throw new HttpError(422, "BLUEPRINT_INVALID", "The proposed plan failed validation", issues);
  if (blueprint.sessionId !== sessionId) throw new HttpError(422, "BLUEPRINT_INVALID", "The plan belongs to another interview");
  return db.transaction(async (tx) => {
    // Serialise versions per session (row lock on the session).
    await tx.select({ id: schema.cbSession.id }).from(schema.cbSession).where(and(eq(schema.cbSession.id, sessionId), eq(schema.cbSession.workspaceId, workspaceId))).for("update");
    const [last] = await tx.select().from(schema.cbBlueprint).where(eq(schema.cbBlueprint.sessionId, sessionId)).orderBy(desc(schema.cbBlueprint.version)).limit(1);
    if (last && canonicalJson(last.body) === canonicalJson(blueprint)) return { row: last, created: false };
    const diff = last ? diffBlueprints(last.body as CompanyBlueprint, blueprint) : null;
    const [row] = await tx
      .insert(schema.cbBlueprint)
      .values({ workspaceId, sessionId, version: (last?.version ?? 0) + 1, profileVersion: blueprint.profileVersion, generator, body: blueprint, diff, createdBy: user.id })
      .returning();
    if (last && last.status !== "superseded") await tx.update(schema.cbBlueprint).set({ status: "superseded" }).where(eq(schema.cbBlueprint.id, last.id));
    return { row: row!, created: true };
  });
}

/** Deterministic plan (DETERMINISTIC_TEST mode): profile snapshot → rules → validation → stored version. */
export async function generateDeterministic(user: CurrentUser, workspaceId: string, sessionId: string, language: "ar" | "en") {
  await requireSession(workspaceId, sessionId);
  const { profile, session } = await snapshotProfile(user, workspaceId, sessionId);
  const body = composeBlueprint(stateOf(session), { sessionId, profileVersion: profile.version, connections: await workspaceConnections(workspaceId), language });
  return storeBlueprint(user, workspaceId, sessionId, body, "deterministic");
}

export async function requireBlueprint(workspaceId: string, blueprintId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(blueprintId)) throw notFound("Plan not found");
  const [row] = await db.select().from(schema.cbBlueprint).where(and(eq(schema.cbBlueprint.id, blueprintId), eq(schema.cbBlueprint.workspaceId, workspaceId)));
  if (!row) throw notFound("Plan not found");
  return row;
}

/** The owner's explicit review of the plan ("preview before applying"). Only the latest version can be approved. */
export async function approveBlueprint(user: CurrentUser, workspaceId: string, blueprintId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.cbBlueprint).where(and(eq(schema.cbBlueprint.id, blueprintId), eq(schema.cbBlueprint.workspaceId, workspaceId))).for("update");
    if (!row) throw notFound("Plan not found");
    if (row.status === "approved") return row;
    if (row.status === "superseded") throw new HttpError(409, "BLUEPRINT_SUPERSEDED", "A newer version of this plan exists");
    const [updated] = await tx.update(schema.cbBlueprint).set({ status: "approved", approvedBy: user.id, approvedAt: new Date() }).where(eq(schema.cbBlueprint.id, row.id)).returning();
    await audit(tx, { workspaceId, actor: userActor(user), action: "company_builder.blueprint_approved", targetType: "cb_blueprint", targetId: row.id, data: { version: row.version } });
    return updated!;
  });
}

export async function listBlueprints(sessionId: string) {
  return db
    .select({ id: schema.cbBlueprint.id, version: schema.cbBlueprint.version, status: schema.cbBlueprint.status, generator: schema.cbBlueprint.generator, createdAt: schema.cbBlueprint.createdAt, diff: schema.cbBlueprint.diff })
    .from(schema.cbBlueprint)
    .where(eq(schema.cbBlueprint.sessionId, sessionId))
    .orderBy(desc(schema.cbBlueprint.version))
    .limit(20);
}
