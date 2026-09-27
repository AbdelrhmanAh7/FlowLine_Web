import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { auth } from "@/lib/auth";
import { forbidden, notFound, unauthorized } from "./http";
import { can, denyReason, isCapability, type Capability } from "./permissions";

/** What a caller needs: a capability from the permission matrix, or (legacy) a minimum role. */
export type Need = Capability | Role;

export function allowed(role: Role, need: Need): boolean {
  return isCapability(need) ? can(role, need) : RANK[role] >= RANK[need as Role];
}

function assertAllowed(role: Role, need: Need) {
  if (allowed(role, need)) return;
  throw forbidden(isCapability(need) ? denyReason(role, need) : `This needs ${need} access; you are a ${role}`);
}

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
export async function requireWorkspace(user: CurrentUser, workspaceId: string, minRole: Need = "viewer") {
  if (!isUuid(workspaceId)) throw notFound("Workspace not found");
  const [row] = await db
    .select({ workspace: schema.workspace, role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, user.id)));
  if (!row) throw notFound("Workspace not found");
  assertAllowed(row.role, minRole);
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
export async function requireFlow(user: CurrentUser, flowId: string, minRole: Need = "viewer") {
  if (!isUuid(flowId)) throw notFound("Flow not found");
  const [flow] = await db
    .select()
    .from(schema.flow)
    .where(and(eq(schema.flow.id, flowId), isNull(schema.flow.deletedAt)));
  if (!flow) throw notFound("Flow not found");
  const { role, workspace } = await requireWorkspace(user, flow.workspaceId, "viewer").catch(() => {
    throw notFound("Flow not found");
  });
  assertAllowed(role, minRole);
  return { flow, role, workspace };
}

export async function requireRun(user: CurrentUser, runId: string, minRole: Need = "viewer") {
  if (!isUuid(runId)) throw notFound("Run not found");
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run) throw notFound("Run not found");
  const { role, workspace } = await requireWorkspace(user, run.workspaceId, "viewer").catch(() => {
    throw notFound("Run not found");
  });
  assertAllowed(role, minRole);
  return { run, role, workspace };
}

export function canEdit(role: Role) {
  return RANK[role] >= RANK.editor;
}

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Loads a connection and checks membership of its workspace (404 for non-members). */
export async function requireConnection(user: CurrentUser, connectionId: string, minRole: Need = "viewer") {
  if (!isUuid(connectionId)) throw notFound("Connection not found");
  const [conn] = await db.select().from(schema.connection).where(eq(schema.connection.id, connectionId));
  if (!conn) throw notFound("Connection not found");
  const { role, workspace } = await requireWorkspace(user, conn.workspaceId, "viewer").catch(() => {
    throw notFound("Connection not found");
  });
  assertAllowed(role, minRole);
  return { connection: conn, role, workspace };
}

export async function requireApproval(user: CurrentUser, approvalId: string, minRole: Need = "viewer") {
  if (!isUuid(approvalId)) throw notFound("Approval not found");
  const [a] = await db.select().from(schema.approval).where(eq(schema.approval.id, approvalId));
  if (!a) throw notFound("Approval not found");
  const { role, workspace } = await requireWorkspace(user, a.workspaceId, "viewer").catch(() => {
    throw notFound("Approval not found");
  });
  assertAllowed(role, minRole);
  return { approval: a, role, workspace };
}

/** Loads a (non-deleted) agent and checks membership of its workspace (404 for non-members). */
export async function requireAgent(user: CurrentUser, agentId: string, need: Need = "agent.view") {
  if (!isUuid(agentId)) throw notFound("Agent not found");
  const [a] = await db.select().from(schema.agent).where(and(eq(schema.agent.id, agentId), isNull(schema.agent.deletedAt)));
  if (!a) throw notFound("Agent not found");
  const { role, workspace } = await requireWorkspace(user, a.workspaceId, "viewer").catch(() => {
    throw notFound("Agent not found");
  });
  assertAllowed(role, need);
  return { agent: a, role, workspace };
}

export async function requireAgentRun(user: CurrentUser, runId: string, need: Need = "agent.view") {
  if (!isUuid(runId)) throw notFound("Agent run not found");
  const [r] = await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, runId));
  if (!r) throw notFound("Agent run not found");
  const { role, workspace } = await requireWorkspace(user, r.workspaceId, "viewer").catch(() => {
    throw notFound("Agent run not found");
  });
  assertAllowed(role, need);
  return { agentRun: r, role, workspace };
}
