import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./access";
import { HttpError } from "./http";

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "workspace";
}

export async function createWorkspace(user: CurrentUser, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 60) throw new HttpError(400, "VALIDATION", "Workspace name must be 2–60 characters");
  const base = slugify(clean);
  return db.transaction(async (tx) => {
    let slug = base;
    for (let i = 2; ; i++) {
      const [taken] = await tx.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.slug, slug));
      if (!taken) break;
      slug = `${base}-${i}`;
    }
    const [ws] = await tx.insert(schema.workspace).values({ name: clean, slug, createdBy: user.id }).returning();
    await tx.insert(schema.workspaceMember).values({ workspaceId: ws.id, userId: user.id, role: "owner" });
    await tx
      .insert(schema.userSettings)
      .values({ userId: user.id, lastWorkspaceId: ws.id })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { lastWorkspaceId: ws.id } });
    return ws;
  });
}

export async function listWorkspaces(user: CurrentUser) {
  return db
    .select({ id: schema.workspace.id, name: schema.workspace.name, slug: schema.workspace.slug, role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .where(eq(schema.workspaceMember.userId, user.id))
    .orderBy(schema.workspace.createdAt);
}

export async function getUserSettings(userId: string) {
  const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
  return row ?? null;
}

export async function listMembers(workspaceId: string) {
  return db
    .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.workspaceMember.role, joinedAt: schema.workspaceMember.createdAt })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(eq(schema.workspaceMember.workspaceId, workspaceId))
    .orderBy(schema.workspaceMember.createdAt);
}

/** Dashboard numbers — all computed from real rows; nothing is estimated. */
export async function workspaceOverview(workspaceId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [flowCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.flow)
    .where(and(eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt)));
  const [runs24] = await db
    .select({
      total: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${schema.run.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${schema.run.status} = 'failed')::int`,
      active: sql<number>`count(*) filter (where ${schema.run.status} in ('queued','running'))::int`,
      flowsRun: sql<number>`count(distinct ${schema.run.flowId})::int`,
    })
    .from(schema.run)
    .where(and(eq(schema.run.workspaceId, workspaceId), gte(schema.run.createdAt, since)));
  const finished = runs24.succeeded + runs24.failed;
  const recent = await db
    .select({
      id: schema.run.id,
      number: schema.run.number,
      status: schema.run.status,
      flowId: schema.run.flowId,
      flowName: schema.flow.name,
      createdAt: schema.run.createdAt,
      durationMs: schema.run.durationMs,
      error: schema.run.error,
      steps: sql<number>`(select count(*)::int from ${schema.runStep} s where s.run_id = ${schema.run.id} and s.status <> 'skipped')`,
      stepsDone: sql<number>`(select count(*)::int from ${schema.runStep} s where s.run_id = ${schema.run.id} and s.status in ('succeeded','reused'))`,
    })
    .from(schema.run)
    .innerJoin(schema.flow, eq(schema.flow.id, schema.run.flowId))
    .where(eq(schema.run.workspaceId, workspaceId))
    .orderBy(desc(schema.run.createdAt))
    .limit(6);
  return {
    flows: flowCount.n,
    flowsRun24h: runs24.flowsRun,
    runs24h: runs24.total,
    successRate24h: finished > 0 ? runs24.succeeded / finished : null,
    failed24h: runs24.failed,
    activeRuns: runs24.active,
    recent,
  };
}

export async function updateWorkspace(workspaceId: string, patch: { name?: string; timezone?: string }) {
  const set: Partial<typeof schema.workspace.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (clean.length < 2 || clean.length > 60) throw new HttpError(400, "VALIDATION", "Workspace name must be 2–60 characters");
    set.name = clean;
  }
  if (patch.timezone !== undefined) {
    if (!Intl.supportedValuesOf("timeZone").includes(patch.timezone) && patch.timezone !== "UTC") {
      throw new HttpError(400, "VALIDATION", "Unknown time zone");
    }
    set.timezone = patch.timezone;
  }
  const [ws] = await db.update(schema.workspace).set(set).where(eq(schema.workspace.id, workspaceId)).returning();
  return ws;
}
