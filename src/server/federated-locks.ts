import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type LockMode = "update" | "share";
export type SessionRow = typeof schema.session.$inferSelect;

/** A session row to lock, found by token (a caller's own or an unissued session) or by id (bound into pending state). */
export interface SessionLock {
  by: { token: string } | { id: string };
  mode: LockMode;
  /** The session must belong to this user. Defaults to the locked user; a pending challenge binds its initiator's own user id. */
  userId?: string;
}

/**
 * Steps 2 and 3 of the federated authority lock order: the user row, THEN the session rows, in the order given.
 * `confirmSsoLink` (src/server/sso-link.ts) and `completeFederatedChallenge` (src/server/federated-mfa.ts) both
 * call this right after locking their own pending-state row, and the SSO callback transactions in
 * src/server/sso.ts take the same two locks in the same order. Before this helper the link path locked the session
 * first and the challenge path the user first, so a link confirmation and a challenge completion for one user
 * sharing a session could deadlock (issue #37). Rule and rationale: docs/security/FEDERATED_MFA.md ("Lock order").
 *
 * Returns the locked rows (undefined when a row is missing, expired or not the expected user's), so a caller still
 * decides what a missing row means. Callers lock every other row (factor, accounts, tenant authority, replay
 * marker) AFTER this call, in the documented order.
 */
export async function lockUserThenSessions(tx: Tx, userId: string, userMode: LockMode, sessions: readonly SessionLock[]) {
  const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, userId)).for(userMode);
  const locked: (SessionRow | undefined)[] = [];
  for (const lock of sessions) {
    const match = "token" in lock.by ? eq(schema.session.token, lock.by.token) : eq(schema.session.id, lock.by.id);
    const [row] = await tx.select().from(schema.session)
      .where(and(match, eq(schema.session.userId, lock.userId ?? userId), gt(schema.session.expiresAt, new Date())))
      .for(lock.mode);
    locked.push(row);
  }
  return { user, sessions: locked };
}
