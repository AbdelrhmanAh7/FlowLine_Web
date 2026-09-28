import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema } from "@/db";
import { randomToken, sha256Hex } from "@/server/crypto";
import { HttpError } from "@/server/http";
import { sendEmail } from "./index";
import { safePath } from "./redirect";
import { renderEmail, requestLocale, type TemplateKind } from "./templates";

type Purpose = "verify" | "reset" | "delete";
const lifetime: Record<Purpose, number> = { verify: 24 * 60 * 60 * 1000, reset: 30 * 60 * 1000, delete: 30 * 60 * 1000 };

export function publicUrl(path: string) {
  const origin = process.env.FLOWLINE_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return new URL(path, origin).toString();
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function clientIp(request?: Request) {
  const ip = request?.headers.get("x-real-ip") ?? request?.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  // TEST STACK ONLY: every E2E browser is the same loopback client, so the per-IP dimension would cap the whole suite
  // at 15 sign-ups an hour. Per-email limits still apply, and explicit client IPs (integration tests) are still limited.
  if (process.env.FLOWLINE_ENV === "test" && ip && LOOPBACK.has(ip)) return undefined;
  return ip;
}

/**
 * Atomic shared PostgreSQL limit (one-hour windows) per email and per client IP. Keys are hashed so email addresses
 * and IPs are not kept here. Throws a 429 HttpError with `code` once either dimension is over its maximum.
 */
export async function checkSharedRate(kind: string, email: string, request: Request | undefined, limits: { email: number; ip: number }, error: { code: string; message: string }) {
  for (const [dimension, value, max] of [["email", email.toLowerCase(), limits.email], ["ip", clientIp(request), limits.ip]] as const) {
    if (dimension === "ip" && !value) continue;
    const key = sha256Hex(`${kind}:${dimension}:${value}`);
    const rows = await db.execute<{ count: number }>(sql`
      insert into email_rate_limit (key, count, window_started_at) values (${key}, 1, now())
      on conflict (key) do update set
        count = case when email_rate_limit.window_started_at < now() - interval '1 hour' then 1 else email_rate_limit.count + 1 end,
        window_started_at = case when email_rate_limit.window_started_at < now() - interval '1 hour' then now() else email_rate_limit.window_started_at end
      returning count`);
    if (Number(rows.rows[0]?.count ?? 0) > max) throw new HttpError(429, error.code, error.message);
  }
}

export async function checkEmailRate(kind: string, email: string, request?: Request) {
  await checkSharedRate(kind, email, request, { email: 3, ip: 15 }, { code: "EMAIL_RATE_LIMIT", message: "Too many email requests. Try again later." });
}

async function sendTemplate(kind: TemplateKind, to: string, link: string, key: string, request?: Request) {
  const rendered = renderEmail(kind, link, requestLocale(request));
  await sendEmail({ to, ...rendered, tags: { purpose: kind }, idempotencyKey: key });
}

/**
 * `callbackURL` (verification only): a same-origin path the verify page links to once the email is confirmed — e.g.
 * `/sign-in?next=invite:…` so an invited person lands back on their invitation after signing in.
 */
export async function issueAccountToken(purpose: Purpose, user: { id: string; email: string }, request?: Request, opts: { callbackURL?: string | null } = {}) {
  await checkEmailRate(purpose, user.email, request);
  const token = randomToken(32);
  const [row] = await db.insert(schema.emailToken).values({ tokenHash: sha256Hex(token), userId: user.id, purpose, expiresAt: new Date(Date.now() + lifetime[purpose]) }).returning({ id: schema.emailToken.id });
  const path = purpose === "verify" ? "/verify-email" : purpose === "reset" ? "/reset-password" : "/account/delete";
  const callback = purpose === "verify" ? safePath(opts.callbackURL, "") : "";
  const link = publicUrl(`${path}?token=${encodeURIComponent(token)}${callback && callback !== "/" ? `&callbackURL=${encodeURIComponent(callback)}` : ""}`);
  try { await sendTemplate(purpose, user.email, link, row!.id, request); }
  catch (error) {
    await db.delete(schema.emailToken).where(eq(schema.emailToken.id, row!.id));
    throw error;
  }
}

export async function sendNotice(kind: "passwordChanged" | "emailVerified" | "emailChanged", to: string, request?: Request) {
  await sendTemplate(kind, to, publicUrl("/app"), crypto.randomUUID(), request);
}

export async function sendInviteEmail(to: string, link: string, request?: Request) {
  await sendTemplate("invite", to, link, crypto.randomUUID(), request);
}

export async function requestToken(purpose: "verify" | "reset", email: string, request?: Request, opts: { callbackURL?: string | null } = {}) {
  const started = Date.now();
  await checkEmailRate(purpose, email, request);
  const [user] = await db.select({ id: schema.user.id, email: schema.user.email, emailVerified: schema.user.emailVerified }).from(schema.user).where(sql`lower(${schema.user.email}) = ${email.trim().toLowerCase()}`);
  if (user && (purpose === "reset" || !user.emailVerified)) {
    const [recent] = await db.select({ createdAt: schema.emailToken.createdAt }).from(schema.emailToken).where(and(eq(schema.emailToken.userId, user.id), eq(schema.emailToken.purpose, purpose))).orderBy(desc(schema.emailToken.createdAt)).limit(1);
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
      const remaining = 500 - (Date.now() - started);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      return;
    }
    // The request itself was already rate limited; do not count delivery a second time.
    const token = randomToken(32);
    const [row] = await db.insert(schema.emailToken).values({ tokenHash: sha256Hex(token), userId: user.id, purpose, expiresAt: new Date(Date.now() + lifetime[purpose]) }).returning({ id: schema.emailToken.id });
    const callback = purpose === "verify" ? safePath(opts.callbackURL, "") : "";
    const link = publicUrl(`${purpose === "verify" ? "/verify-email" : "/reset-password"}?token=${token}${callback && callback !== "/" ? `&callbackURL=${encodeURIComponent(callback)}` : ""}`);
    try { await sendTemplate(purpose, user.email, link, row!.id, request); }
    catch { await db.delete(schema.emailToken).where(eq(schema.emailToken.id, row!.id)); }
  }
  const remaining = 500 - (Date.now() - started);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

export type TokenState = "invalid" | "expired" | "used" | "valid";
export async function tokenState(purpose: Purpose, token: string): Promise<TokenState> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return "invalid";
  const [row] = await db.select().from(schema.emailToken).where(and(eq(schema.emailToken.tokenHash, sha256Hex(token)), eq(schema.emailToken.purpose, purpose)));
  if (!row) return "invalid";
  if (row.consumedAt) return "used";
  if (row.expiresAt <= new Date()) return "expired";
  return "valid";
}

export async function consumeAccountToken(purpose: Purpose, token: string, value?: string, currentUserId?: string): Promise<TokenState | "done" | "transfer_required"> {
  const state = await tokenState(purpose, token);
  if (state !== "valid") return state;
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.emailToken).where(and(eq(schema.emailToken.tokenHash, sha256Hex(token)), eq(schema.emailToken.purpose, purpose))).for("update");
    if (!row) return "invalid";
    if (row.consumedAt) return "used";
    if (row.expiresAt <= new Date()) return "expired";
    if (!row.userId || (purpose === "delete" && row.userId !== currentUserId)) return "invalid";
    if (purpose === "delete") {
      const memberships = await tx.select({ workspaceId: schema.workspaceMember.workspaceId, role: schema.workspaceMember.role }).from(schema.workspaceMember).where(eq(schema.workspaceMember.userId, row.userId));
      const owned = await tx.select({ workspaceId: schema.workspaceMember.workspaceId }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.userId, row.userId), eq(schema.workspaceMember.role, "owner")));
      for (const membership of owned) {
        const [otherOwner] = await tx.select({ userId: schema.workspaceMember.userId }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, membership.workspaceId), sql`${schema.workspaceMember.userId} <> ${row.userId}`, eq(schema.workspaceMember.role, "owner"))).limit(1);
        const [otherMember] = await tx.select({ userId: schema.workspaceMember.userId }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, membership.workspaceId), sql`${schema.workspaceMember.userId} <> ${row.userId}`)).limit(1);
        if (otherMember && !otherOwner) return "transfer_required";
      }
      // Workspaces where this user is the only member are deleted with the account (their flows, runs, connections,
      // knowledge… cascade) — no orphaned workspace is left behind (PRIVACY_AND_SAFETY.md §4).
      const soleWorkspaces: string[] = [];
      for (const membership of memberships) {
        const [other] = await tx.select({ userId: schema.workspaceMember.userId }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, membership.workspaceId), sql`${schema.workspaceMember.userId} <> ${row.userId}`)).limit(1);
        if (!other) soleWorkspaces.push(membership.workspaceId);
      }
      // Preserve a security audit record (in shared workspaces) after the account row is removed.
      for (const membership of memberships) {
        if (soleWorkspaces.includes(membership.workspaceId)) continue;
        await tx.insert(schema.auditEvent).values({ workspaceId: membership.workspaceId, actorLabel: "Account deletion", action: "account.deleted", targetType: "user", targetId: row.userId, data: { role: membership.role } });
      }
      for (const workspaceId of soleWorkspaces) await tx.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
      await tx.update(schema.emailToken).set({ consumedAt: new Date() }).where(eq(schema.emailToken.id, row.id));
      await tx.delete(schema.user).where(eq(schema.user.id, row.userId));
      return "done";
    }
    if (purpose === "reset") {
      if (!value || value.length < 8 || value.length > 128) throw new HttpError(400, "PASSWORD_LENGTH", "Password must be 8–128 characters.");
      const hashed = await hashPassword(value);
      const [credential] = await tx.select({ id: schema.account.id }).from(schema.account).where(and(eq(schema.account.userId, row.userId), eq(schema.account.providerId, "credential")));
      if (credential) await tx.update(schema.account).set({ password: hashed }).where(eq(schema.account.id, credential.id));
      else await tx.insert(schema.account).values({ id: crypto.randomUUID(), accountId: row.userId, providerId: "credential", userId: row.userId, password: hashed });
      await tx.delete(schema.session).where(eq(schema.session.userId, row.userId));
    } else {
      await tx.update(schema.user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(schema.user.id, row.userId));
    }
    await tx.update(schema.emailToken).set({ consumedAt: new Date() }).where(and(eq(schema.emailToken.id, row.id), isNull(schema.emailToken.consumedAt)));
    return "done";
  });
}
