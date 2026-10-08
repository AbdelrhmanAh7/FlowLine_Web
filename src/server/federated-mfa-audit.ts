import { and, eq, like, lt } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { audit, userActor } from "./audit";
import { platformAudit } from "./platform-audit";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Bounded reason codes (issue #72). Never the code, the pending token or an exception message. */
export type FederatedMfaFailure = "invalid_code" | "replayed_code" | "expired" | "rate_limited";
interface Challenge { userId: string; workspace?: { workspaceId: string }; global?: { provider: string } }

/**
 * Records a refused or abandoned federated MFA step: `sso.mfa_failed` in the workspace audit for a workspace challenge,
 * `signin.mfa_failed` in the platform audit for a global-provider (social) challenge. Callers write it outside the
 * completion transaction so a refused attempt that rolls back is still recorded.
 */
export async function auditFederatedMfaFailure(connection: DbOrTx, pending: Challenge, reason: FederatedMfaFailure, assurance: "federated_pending" | "system" = "federated_pending") {
  const [user] = await connection.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(eq(schema.user.id, pending.userId));
  if (!user) return;
  if (pending.workspace) {
    const [ws] = await connection.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.id, pending.workspace.workspaceId));
    if (ws) await audit(connection, { workspaceId: ws.id, actor: userActor(user), action: "sso.mfa_failed", targetType: "user", targetId: user.id, data: { reason } });
  } else if (pending.global) {
    await platformAudit(connection, { actor: { userId: user.id, label: user.email }, assurance, action: "signin.mfa_failed", result: "denied", data: { reason, provider: pending.global.provider } });
  }
}

/**
 * Abandoned challenges have no request to hook: the retention sweep deletes expired `federated-mfa:*` rows here, before
 * the generic `verification` cleanup, and audits each one as `expired`. The delete returns a row once, so a challenge
 * already audited by a late request (which deletes it too) is never audited twice.
 */
export async function sweepAbandonedFederatedChallenges(tx: DbOrTx, now: Date) {
  const rows = await tx.delete(schema.verification).where(and(like(schema.verification.identifier, "federated-mfa:%"), lt(schema.verification.expiresAt, now))).returning({ value: schema.verification.value });
  for (const row of rows) {
    let pending: Challenge;
    try { pending = JSON.parse(row.value) as Challenge; } catch { continue; }
    await auditFederatedMfaFailure(tx, pending, "expired", "system");
  }
  return rows.length;
}
