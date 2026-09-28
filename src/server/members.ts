import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { isUuid, type CurrentUser } from "./access";
import { audit, userActor } from "./audit";
import { randomToken, sha256Hex } from "./crypto";
import { HttpError, notFound } from "./http";
import { checkEmailRate, sendInviteEmail } from "./email/flows";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normEmail = (e: string) => e.trim().toLowerCase();

export function inviteUrl(token: string) {
  return `${(process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "")}/invite/${token}`;
}

/**
 * Creates an invitation. The raw token is returned once (for the link) and only its hash is stored.
 * Delivers the link after the invite is persisted. A failure is surfaced to the caller.
 */
export async function createInvite(user: CurrentUser, workspaceId: string, input: { email: string; role: Role }, request?: Request) {
  const email = normEmail(input.email);
  await checkEmailRate("invite", email, request);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: schema.user.id })
      .from(schema.workspaceMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
      .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.user.email, email)));
    if (existing) throw new HttpError(409, "ALREADY_MEMBER", `${email} is already a member of this workspace`);
    // One live invite per email: a new one replaces any pending one.
    await tx
      .update(schema.workspaceInvite)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.workspaceInvite.workspaceId, workspaceId), eq(schema.workspaceInvite.email, email), isNull(schema.workspaceInvite.acceptedAt), isNull(schema.workspaceInvite.revokedAt)));
    const token = randomToken(32);
    const [invite] = await tx
      .insert(schema.workspaceInvite)
      .values({ workspaceId, email, role: input.role, tokenHash: sha256Hex(token), invitedBy: user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .returning();
    await audit(tx, { workspaceId, actor: userActor(user), action: "member.invited", targetType: "invite", targetId: invite!.id, data: { email, role: input.role } });
    return { invite: publicInvite(invite!), url: inviteUrl(token) };
  });
  // The email is best-effort: the invite exists either way and the owner always gets the link. During the beta the
  // email sandbox (FLOWLINE_EMAIL_ALLOWED_RECIPIENTS) or a provider outage can refuse delivery — say so, don't fail.
  const emailed = await sendInviteEmail(email, result.url, request).then(
    () => true,
    () => false,
  );
  return { ...result, emailed };
}

function publicInvite(i: typeof schema.workspaceInvite.$inferSelect) {
  const now = new Date();
  const status = i.acceptedAt ? "accepted" : i.revokedAt ? "revoked" : i.expiresAt < now ? "expired" : "pending";
  return { id: i.id, email: i.email, role: i.role, status, createdAt: i.createdAt, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt };
}

export async function listInvites(workspaceId: string) {
  const rows = await db.select().from(schema.workspaceInvite).where(eq(schema.workspaceInvite.workspaceId, workspaceId)).orderBy(desc(schema.workspaceInvite.createdAt)).limit(100);
  return rows.map(publicInvite);
}

export async function revokeInvite(user: CurrentUser, workspaceId: string, inviteId: string) {
  if (!isUuid(inviteId)) throw notFound("Pending invite not found");
  const [row] = await db
    .update(schema.workspaceInvite)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.workspaceInvite.id, inviteId), eq(schema.workspaceInvite.workspaceId, workspaceId), isNull(schema.workspaceInvite.acceptedAt), isNull(schema.workspaceInvite.revokedAt)))
    .returning();
  if (!row) throw notFound("Pending invite not found");
  await audit(db, { workspaceId, actor: userActor(user), action: "member.invite_revoked", targetType: "invite", targetId: inviteId, data: { email: row.email } });
}

async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .select({ invite: schema.workspaceInvite, workspaceName: schema.workspace.name, workspaceSlug: schema.workspace.slug })
    .from(schema.workspaceInvite)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceInvite.workspaceId))
    .where(eq(schema.workspaceInvite.tokenHash, sha256Hex(token)));
  return row ?? null;
}

/** What the invite page shows before accepting. Reveals nothing unless the token is valid. */
export async function previewInvite(user: CurrentUser, token: string) {
  const row = await findInvite(token);
  if (!row) throw notFound("This invitation link isn't valid");
  const inv = publicInvite(row.invite);
  return { workspaceName: row.workspaceName, role: inv.role, status: inv.status, emailMatches: normEmail(user.email) === row.invite.email, invitedEmail: row.invite.email, expiresAt: inv.expiresAt };
}

/** Accepts an invitation: signed-in user whose email matches, pending, unexpired, single use. */
export async function acceptInvite(user: CurrentUser, token: string) {
  const row = await findInvite(token);
  if (!row) throw notFound("This invitation link isn't valid");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.workspaceInvite).where(eq(schema.workspaceInvite.id, row.invite.id)).for("update");
    if (!inv) throw notFound("This invitation link isn't valid");
    if (inv.acceptedAt) throw new HttpError(409, "INVITE_USED", "This invitation was already used");
    if (inv.revokedAt) throw new HttpError(410, "INVITE_REVOKED", "This invitation was revoked — ask for a new one");
    if (inv.expiresAt < new Date()) throw new HttpError(410, "INVITE_EXPIRED", "This invitation expired — ask for a new one");
    if (normEmail(user.email) !== inv.email) throw new HttpError(403, "INVITE_EMAIL_MISMATCH", `This invitation is for ${inv.email}. Sign in with that email to accept it.`);
    const [already] = await tx
      .select()
      .from(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, inv.workspaceId), eq(schema.workspaceMember.userId, user.id)));
    if (!already) await tx.insert(schema.workspaceMember).values({ workspaceId: inv.workspaceId, userId: user.id, role: inv.role });
    await tx.update(schema.workspaceInvite).set({ acceptedAt: new Date(), acceptedBy: user.id }).where(eq(schema.workspaceInvite.id, inv.id));
    // Joining a workspace completes onboarding for invited users (they don't need to create their own).
    await tx
      .insert(schema.userSettings)
      .values({ userId: user.id, onboardingCompletedAt: new Date(), lastWorkspaceId: inv.workspaceId })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { lastWorkspaceId: inv.workspaceId, onboardingCompletedAt: sql`coalesce(${schema.userSettings.onboardingCompletedAt}, now())` } });
    await audit(tx, { workspaceId: inv.workspaceId, actor: userActor(user), action: "member.joined", targetType: "user", targetId: user.id, data: { role: already?.role ?? inv.role } });
    return { workspaceId: inv.workspaceId, slug: row.workspaceSlug, role: already?.role ?? inv.role };
  });
}

async function ownerCount(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], workspaceId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.role, "owner")));
  return Number(r?.n ?? 0);
}

export async function changeRole(user: CurrentUser, workspaceId: string, targetUserId: string, role: Role) {
  return db.transaction(async (tx) => {
    // Serialize membership changes per workspace so two owners can't demote each other at once.
    await tx.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId)).for("update");
    const [m] = await tx
      .select()
      .from(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, targetUserId)));
    if (!m) throw notFound("Member not found");
    if (m.role === role) return { role };
    if (m.role === "owner" && (await ownerCount(tx, workspaceId)) <= 1) throw new HttpError(409, "LAST_OWNER", "A workspace needs at least one owner — make someone else an owner first");
    await tx.update(schema.workspaceMember).set({ role }).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, targetUserId)));
    await audit(tx, { workspaceId, actor: userActor(user), action: "member.role_changed", targetType: "user", targetId: targetUserId, data: { from: m.role, to: role } });
    return { role };
  });
}

/** Removes a member. Access ends on their next request (membership is checked per request). */
export async function removeMember(user: CurrentUser, workspaceId: string, targetUserId: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.workspace.id }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId)).for("update");
    const [m] = await tx
      .select()
      .from(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, targetUserId)));
    if (!m) throw notFound("Member not found");
    if (m.role === "owner" && (await ownerCount(tx, workspaceId)) <= 1) throw new HttpError(409, "LAST_OWNER", "The last owner can't be removed");
    await tx.delete(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, targetUserId)));
    // Their pending API-driven or agent work must not continue with their authority: queued runs re-check
    // the acting user at claim (PERMISSION_REVOKED); pending approvals they decided are re-checked at execution.
    await audit(tx, { workspaceId, actor: userActor(user), action: "member.removed", targetType: "user", targetId: targetUserId, data: { role: m.role } });
  });
}

export async function pendingInviteCount(workspaceId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(schema.workspaceInvite)
    .where(and(eq(schema.workspaceInvite.workspaceId, workspaceId), isNull(schema.workspaceInvite.acceptedAt), isNull(schema.workspaceInvite.revokedAt), gt(schema.workspaceInvite.expiresAt, new Date())));
  return Number(r?.n ?? 0);
}
