import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { auth } from "@/lib/auth";
import { forbidden, notFound, unauthorized } from "./http";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/**
 * Resolves a workspace the user belongs to. Non-members get 404 (not 403) so
 * workspace existence isn't leaked across tenants.
 */
export async function requireWorkspace(user: CurrentUser, workspaceId: string, minRole: Role = "viewer") {
  if (!isUuid(workspaceId)) throw notFound("Workspace not found");
  const [row] = await db
    .select({ workspace: schema.workspace, role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, user.id)));
  if (!row) throw notFound("Workspace not found");
  if (RANK[row.role] < RANK[minRole]) throw forbidden(`This needs ${minRole} access; you are a ${row.role}`);
  return row;
}

export async function requireWorkspaceBySlug(user: CurrentUser, slug: string) {
  const [row] = await db
    .select({ workspace: schema.workspace, role: schema.workspaceMember.role })
    .from(schema.workspace)
    .innerJoin(schema.workspaceMember, and(eq(schema.workspaceMember.workspaceId, schema.workspace.id), eq(schema.workspaceMember.userId, user.id)))
    .where(eq(schema.workspace.slug, slug));
  return row ?? null;
}

/** Loads a (non-deleted) flow and checks membership of its workspace. */
export async function requireFlow(user: CurrentUser, flowId: string, minRole: Role = "viewer") {
  if (!isUuid(flowId)) throw notFound("Flow not found");
  const [flow] = await db
    .select()
    .from(schema.flow)
    .where(and(eq(schema.flow.id, flowId), isNull(schema.flow.deletedAt)));
  if (!flow) throw notFound("Flow not found");
  const { role, workspace } = await requireWorkspace(user, flow.workspaceId, "viewer").catch(() => {
    throw notFound("Flow not found");
  });
  if (RANK[role] < RANK[minRole]) throw forbidden(`This needs ${minRole} access; you are a ${role}`);
  return { flow, role, workspace };
}

export async function requireRun(user: CurrentUser, runId: string, minRole: Role = "viewer") {
  if (!isUuid(runId)) throw notFound("Run not found");
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run) throw notFound("Run not found");
  const { role, workspace } = await requireWorkspace(user, run.workspaceId, "viewer").catch(() => {
    throw notFound("Run not found");
  });
  if (RANK[role] < RANK[minRole]) throw forbidden(`This needs ${minRole} access; you are a ${role}`);
  return { run, role, workspace };
}

export function canEdit(role: Role) {
  return RANK[role] >= RANK.editor;
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Loads a connection and checks membership of its workspace (404 for non-members). */
export async function requireConnection(user: CurrentUser, connectionId: string, minRole: Role = "viewer") {
  if (!isUuid(connectionId)) throw notFound("Connection not found");
  const [conn] = await db.select().from(schema.connection).where(eq(schema.connection.id, connectionId));
  if (!conn) throw notFound("Connection not found");
  const { role, workspace } = await requireWorkspace(user, conn.workspaceId, "viewer").catch(() => {
    throw notFound("Connection not found");
  });
  if (RANK[role] < RANK[minRole]) throw forbidden(`This needs ${minRole} access; you are a ${role}`);
  return { connection: conn, role, workspace };
}

export async function requireApproval(user: CurrentUser, approvalId: string, minRole: Role = "viewer") {
  if (!isUuid(approvalId)) throw notFound("Approval not found");
  const [a] = await db.select().from(schema.approval).where(eq(schema.approval.id, approvalId));
  if (!a) throw notFound("Approval not found");
  const { role, workspace } = await requireWorkspace(user, a.workspaceId, "viewer").catch(() => {
    throw notFound("Approval not found");
  });
  if (RANK[role] < RANK[minRole]) throw forbidden(`This needs ${minRole} access; you are a ${role}`);
  return { approval: a, role, workspace };
}
