import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { redact } from "./redact";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Who did it: a signed-in user, an API key, or the system (worker, webhook). */
export type Actor = { kind: "user"; userId: string; label: string } | { kind: "apikey"; apiKeyId: string; label: string } | { kind: "system"; label: string };

/**
 * Audit actions. Security- and billing-relevant changes only (member, role, API key, integration,
 * publish, approval, billing, sensitive settings). Never pass secrets: `data` is redacted anyway.
 */
export type AuditAction =
  | "member.invited"
  | "member.invite_revoked"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "apikey.created"
  | "apikey.revoked"
  | "integration.connected"
  | "integration.reconnected"
  | "integration.deleted"
  | "integration.expired"
  | "flow.published"
  | "flow.rolled_back"
  | "flow.shared"
  | "approval.decided"
  | "billing.checkout_started"
  | "billing.plan_changed"
  | "billing.cancelled"
  | "billing.subscription_updated"
  | "billing.payment_failed"
  | "billing.refunded"
  | "settings.updated"
  | "sso.configured"
  | "sso.signin"
  | "knowledge.deleted"
  | "knowledge.disabled"
  | "agent.version_created"
  | "ai.connected"
  | "ai.key_replaced"
  | "ai.disconnected"
  | "ai.use_roles_changed"
  | "ai.default_route_changed"
  | "oauth_app.configured"
  | "oauth_app.secret_rotated"
  | "oauth_app.switched"
  | "oauth_app.deleted"
  | "oauth_app.verified"
  | "oauth_app.probe"
  | "oauth_app.rejected_by_provider"
  | "company_builder.blueprint_approved"
  | "company_builder.installed"
  | "company_builder.review_decided"
  | "company_builder.activation_changed"
  | "company_builder.entitlement_changed"
  | "company_builder.cli_job";

export async function audit(db: DbOrTx, e: { workspaceId: string; actor: Actor; action: AuditAction; targetType?: string; targetId?: string; data?: unknown }) {
  await db.insert(schema.auditEvent).values({
    workspaceId: e.workspaceId,
    actorUserId: e.actor.kind === "user" ? e.actor.userId : null,
    actorApiKeyId: e.actor.kind === "apikey" ? e.actor.apiKeyId : null,
    actorLabel: e.actor.label,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    data: e.data === undefined ? null : (redact(e.data) as object),
  });
}

export const userActor = (u: { id: string; email: string }): Actor => ({ kind: "user", userId: u.id, label: u.email });

export async function listAudit(db: Db, workspaceId: string, opts: { before?: number; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await db
    .select()
    .from(schema.auditEvent)
    .where(opts.before ? and(eq(schema.auditEvent.workspaceId, workspaceId), lt(schema.auditEvent.id, opts.before)) : eq(schema.auditEvent.workspaceId, workspaceId))
    .orderBy(desc(schema.auditEvent.id))
    .limit(limit + 1);
  return { events: rows.slice(0, limit), nextBefore: rows.length > limit ? rows[limit - 1]!.id : null };
}
