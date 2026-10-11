import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { correlationId } from "./telemetry";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Platform security audit (docs/security/CREDENTIALS_DESIGN.md MUST 20). Separate from the workspace audit: no
 * workspace, no cascade, never pruned by `pruneOnce`. Typed columns only — writers build every field by hand; there is
 * no free-form payload, so values, suffixes, bodies, ciphertext and provider errors have nowhere to go.
 */
export type PlatformAction =
  | "setup.challenge_issued"
  | "setup.challenge_redeemed"
  | "setup.denied"
  | "setup.email_configured"
  | "setup.completed"
  | "admin.granted"
  | "admin.revoked"
  | "admin.totp_enrolled"
  | "admin.stepup"
  | "admin.access_denied"
  | "signin.mfa_failed"
  | "platform_secret.set"
  | "platform_secret.rotated"
  | "platform_secret.switched"
  | "platform_secret.revoked"
  | "platform_secret.cleared"
  | "platform_secret.imported_from_env"
  | "platform_secret.probe"
  | "platform_secret.verified"
  | "platform_secret.rejected_by_provider"
  | "platform_secret.decrypt_failed"
  | "platform_setting.set"
  | "crypto.rewrap";

/** How strongly the actor was authenticated for this action. */
export type Assurance = "session_totp_stepup" | "session" | "setup_session" | "cli" | "system" | "federated_pending";

export interface PlatformAuditInput {
  actor: { userId: string | null; label: string };
  assurance: Assurance;
  action: PlatformAction;
  result: "ok" | "denied" | "failed" | "rejected" | "unverified" | "accepted" | "unreachable" | "skipped";
  targetType?: "platform_secret" | "platform_setting" | "platform_admin" | "setup_challenge" | "table";
  targetId?: string;
  purpose?: string;
  oldRevision?: number | null;
  newRevision?: number | null;
  /** A few scalars (counts, provider ids, bounded codes). Never a secret or a provider message. */
  data?: Record<string, string | number | boolean | null>;
}

const CHANGE_ACTIONS = new Set<PlatformAction>([
  "setup.completed",
  "setup.email_configured",
  "admin.granted",
  "admin.revoked",
  "admin.totp_enrolled",
  "platform_secret.set",
  "platform_secret.rotated",
  "platform_secret.switched",
  "platform_secret.revoked",
  "platform_secret.cleared",
  "platform_secret.imported_from_env",
  "platform_secret.rejected_by_provider",
  "platform_setting.set",
  "crypto.rewrap",
]);

const SAFE_DATA_VALUE = /^[A-Za-z0-9 ._:@/+-]{0,120}$/;

function cleanData(data: PlatformAuditInput["data"]) {
  if (!data) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!/^[a-zA-Z]{1,40}$/.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && SAFE_DATA_VALUE.test(v)) out[k] = v;
  }
  return out;
}

/**
 * Writes one platform audit event in the caller's transaction and — for changes — enqueues a metadata-only
 * notification for every OTHER active admin in the same transaction (delivered later with retries; a broken email
 * credential never loses the record or rolls back the repair).
 */
export async function platformAudit(tx: DbOrTx, e: PlatformAuditInput): Promise<number> {
  const [row] = await tx
    .insert(schema.platformAuditEvent)
    .values({
      actorUserId: e.actor.userId,
      actorLabel: e.actor.label.slice(0, 200),
      assurance: e.assurance,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      purpose: e.purpose ?? null,
      oldRevision: e.oldRevision ?? null,
      newRevision: e.newRevision ?? null,
      result: e.result,
      requestId: correlationId(),
      data: cleanData(e.data),
    })
    .returning({ id: schema.platformAuditEvent.id });
  if (CHANGE_ACTIONS.has(e.action) && (e.result === "ok" || e.action === "platform_secret.rejected_by_provider")) {
    const admins = await tx
      .select({ userId: schema.platformAdmin.userId })
      .from(schema.platformAdmin)
      .where(and(eq(schema.platformAdmin.status, "active"), e.actor.userId ? ne(schema.platformAdmin.userId, e.actor.userId) : sql`true`));
    if (admins.length) await tx.insert(schema.platformNotification).values(admins.map((a) => ({ auditEventId: row!.id, recipientUserId: a.userId })));
  }
  return row!.id;
}

/** Client-safe projection of platform audit events (the panel's read-only log). */
export async function listPlatformAudit(db: Db, opts: { purpose?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 200);
  const rows = await db
    .select()
    .from(schema.platformAuditEvent)
    .where(opts.purpose ? eq(schema.platformAuditEvent.purpose, opts.purpose) : undefined)
    .orderBy(desc(schema.platformAuditEvent.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actorLabel,
    assurance: r.assurance,
    action: r.action,
    result: r.result,
    targetType: r.targetType,
    purpose: r.purpose,
    oldRevision: r.oldRevision,
    newRevision: r.newRevision,
    requestId: r.requestId,
    data: r.data,
  }));
}

/**
 * Delivers pending admin notifications (worker loop). Metadata only: action, purpose, revisions, actor and time — the
 * same fields the panel shows. Failures back off and never block anything. Returns the number sent.
 */
export async function deliverPlatformNotifications(db: Db, send: (to: string, subject: string, text: string, id: string) => Promise<void>): Promise<number> {
  const due = await db
    .select({ n: schema.platformNotification, e: schema.platformAuditEvent, email: schema.user.email })
    .from(schema.platformNotification)
    .innerJoin(schema.platformAuditEvent, eq(schema.platformAuditEvent.id, schema.platformNotification.auditEventId))
    .innerJoin(schema.user, eq(schema.user.id, schema.platformNotification.recipientUserId))
    // Due-ness is judged on the DATABASE clock (the rows were stamped by it), so app/DB clock skew can't delay or skip them.
    .where(and(isNull(schema.platformNotification.sentAt), sql`${schema.platformNotification.nextAttemptAt} <= now()`, sql`${schema.platformNotification.attempts} < 8`))
    .orderBy(schema.platformNotification.createdAt)
    .limit(20);
  let sent = 0;
  for (const { n, e, email } of due) {
    const lines = [
      `A platform security event was recorded on Flowline.`,
      ``,
      `Action: ${e.action}`,
      `Result: ${e.result}`,
      e.purpose ? `Purpose: ${e.purpose}` : null,
      e.oldRevision != null || e.newRevision != null ? `Revision: ${e.oldRevision ?? "-"} -> ${e.newRevision ?? "-"}` : null,
      `By: ${e.actorLabel} (${e.assurance})`,
      `At: ${e.at.toISOString()}`,
      ``,
      `Review it in the platform admin panel. If you did not expect this change, revoke the credential and investigate.`,
    ].filter((l): l is string => l !== null);
    try {
      await send(email, `[Flowline] Platform security event: ${e.action}`, lines.join("\n"), n.id);
      await db.update(schema.platformNotification).set({ sentAt: new Date(), attempts: n.attempts + 1, lastErrorCode: null }).where(eq(schema.platformNotification.id, n.id));
      sent++;
    } catch (err) {
      const code = err instanceof Error && /^[A-Z_]{3,40}$/.test((err as Error & { code?: string }).code ?? "") ? (err as Error & { code: string }).code : "DELIVERY_FAILED";
      const backoffMin = Math.min(60, 2 ** n.attempts);
      await db
        .update(schema.platformNotification)
        .set({ attempts: n.attempts + 1, lastErrorCode: code, nextAttemptAt: sql`now() + make_interval(mins => ${backoffMin})` })
        .where(eq(schema.platformNotification.id, n.id));
    }
  }
  return sent;
}
