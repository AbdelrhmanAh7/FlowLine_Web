import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { db, schema, type Db } from "@/db";
import { randomToken, sha256Hex } from "./crypto";
import { HttpError } from "./http";
import { checkRate } from "./rate-limit";
import { safePath } from "./email/redirect";
import { audit, userActor } from "./audit";
import type { Role } from "@/db/schema";
import { bindFederatedLink, federatedProviderId } from "./federated-link";

export const FEDERATED_MFA_COOKIE = "fl_federated_mfa";
const pendingId = (token: string) => `federated-mfa:${sha256Hex(token)}`;
const assuranceId = (token: string) => `mfa-session:${sha256Hex(token)}`;
const invalid = () => new HttpError(401, "FEDERATED_MFA_INVALID", "Restart sign-in to confirm your authenticator");
interface WorkspaceSignIn { workspaceId: string; newMember: boolean; role: Role; configStamp: string; providerId: string; subject: string; initiator?: { sessionId: string; userId: string; sessionHash: string } }
interface GlobalSignIn { provider: string; configStamp: string }
interface Pending { userId: string; next: string; userStamp: string; factorHash: string; accountsHash: string; workspace?: WorkspaceSignIn; global?: GlobalSignIn }
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function accountsHash(accounts: (typeof schema.account.$inferSelect)[]) {
  // Ignore refreshed provider tokens; include local password changes and unlink/relink.
  return sha256Hex(JSON.stringify(accounts.map((a) => [a.id, a.providerId, a.accountId, a.password]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
}

export function federatedCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: (process.env.BETTER_AUTH_URL ?? process.env.FLOWLINE_PUBLIC_URL ?? "").startsWith("https:"), path: "/", maxAge: 600 };
}

export function federatedDestination(value: string) {
  if (value.startsWith("/")) return safePath(value, "/app");
  try {
    const url = new URL(value);
    const origins = [process.env.FLOWLINE_PUBLIC_URL, process.env.BETTER_AUTH_URL].filter(Boolean).map((u) => new URL(u!).origin);
    if (origins.includes(url.origin)) return safePath(`${url.pathname}${url.search}${url.hash}`, "/app");
  } catch { /* invalid callback URL */ }
  return "/app";
}

export async function recordMfaAssurance(token: string, userId: string, expiresAt: Date, tx: Db | Tx = db) {
  const [factor] = await tx.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  if (!factor || factor.verified === false) throw invalid();
  // Deterministic PK + expiry avoids duplicates when an enrollment hook runs twice.
  const id = assuranceId(token);
  const value = JSON.stringify([userId, sha256Hex(factor.secret)]);
  await tx.insert(schema.verification).values({ id, identifier: id, value, expiresAt }).onConflictDoUpdate({ target: schema.verification.id, set: { value, expiresAt } });
}
export async function hasSessionMfa(token: string, userId: string) {
  const [factor] = await db.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  if (!factor || factor.verified === false) return false;
  const value = JSON.stringify([userId, sha256Hex(factor.secret)]);
  const [proof] = await db.select().from(schema.verification).where(and(eq(schema.verification.identifier, assuranceId(token)), eq(schema.verification.value, value), gt(schema.verification.expiresAt, new Date())));
  return Boolean(proof);
}

/** Opaque pending state is the only cookie granted before local TOTP succeeds. */
export async function createFederatedChallenge(userId: string, next: string, workspace?: WorkspaceSignIn, connection: Db | Tx = db, global?: GlobalSignIn) {
  const [user] = await connection.select().from(schema.user).where(eq(schema.user.id, userId));
  const [tf] = await connection.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  if (!user?.twoFactorEnabled || !tf || tf.verified === false) throw invalid();
  const accounts = await connection.select().from(schema.account).where(eq(schema.account.userId, userId));
  const token = randomToken(32);
  const value: Pending = { userId, next: federatedDestination(next), userStamp: user.updatedAt.toISOString(), factorHash: sha256Hex(tf.secret), accountsHash: accountsHash(accounts), ...(workspace ? { workspace } : {}), ...(global ? { global } : {}) };
  await connection.insert(schema.verification).values({ id: randomUUID(), identifier: pendingId(token), value: JSON.stringify(value), expiresAt: new Date(Date.now() + 600_000) });
  return token;
}

export async function federatedChallenge(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const [row] = await db.select().from(schema.verification).where(and(eq(schema.verification.identifier, pendingId(token)), gt(schema.verification.expiresAt, new Date())));
  if (!row) throw invalid();
  const pending = JSON.parse(row.value) as Pending;
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, pending.userId));
  if (!user?.twoFactorEnabled || user.updatedAt.toISOString() !== pending.userStamp) throw invalid();
  return { row, pending };
}

/** An adapter-created session is held unissued until consumption/assurance commit.
 * Password recovery, enrollment changes and replay invalidate the challenge.
 * Only TOTP is accepted here: IdP assertions/trusted-device cookies cannot skip it.
 */
export async function completeFederatedChallenge(token: string, code: string) {
  const { row, pending } = await federatedChallenge(token);
  if (!(await checkRate(`federated-mfa:${pending.userId}`, 5, 300))) throw new HttpError(429, "RATE_LIMITED", "Try again later");
  const { verifyTotp } = await import("./platform-access");
  if (await verifyTotp(pending.userId, code) === null) throw new HttpError(403, "FEDERATED_MFA_CODE_INVALID", "Enter the current authenticator code");
  const { auth } = await import("@/lib/auth");
  const ctx = await auth.$context;
  // Adapter hooks/defaults run outside our locks, matching the ordinary SSO fence.
  const session = await ctx.internalAdapter.createSession(pending.userId);
  try {
    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(schema.verification).where(and(eq(schema.verification.id, row.id), gt(schema.verification.expiresAt, new Date()))).for("update");
      if (!fresh || fresh.value !== row.value) throw invalid();
      const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, pending.userId)).for("update");
      const [tf] = await tx.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, pending.userId)).for("update");
      if (!user?.twoFactorEnabled || user.updatedAt.toISOString() !== pending.userStamp || !tf || tf.verified === false || sha256Hex(tf.secret) !== pending.factorHash) throw invalid();
      const accounts = await tx.select().from(schema.account).where(eq(schema.account.userId, user.id)).for("share");
      if (accountsHash(accounts) !== pending.accountsHash) throw invalid();
      if (pending.global) {
        // Serialize DB-backed app revocation/rotation and issuer replacement with
        // the final authority check. Environment changes require a process restart.
        await tx.select({ id: schema.platformSecret.id }).from(schema.platformSecret).where(eq(schema.platformSecret.purpose, `signin.${pending.global.provider}`)).for("share");
        if (pending.global.provider === "zitadel") await tx.select({ key: schema.platformSetting.key }).from(schema.platformSetting).where(eq(schema.platformSetting.key, "signin.zitadel.issuer")).for("share");
        const { federatedProviderStamp } = await import("./auth-dispatch");
        if (await federatedProviderStamp(pending.global.provider) !== pending.global.configStamp) throw invalid();
      }
      const [currentSession] = await tx.select().from(schema.session).where(and(eq(schema.session.token, session.token), eq(schema.session.userId, user.id), gt(schema.session.expiresAt, new Date()))).for("share");
      if (!currentSession) throw invalid();
      if (pending.workspace) {
        const { workspaceId, configStamp, providerId, subject } = pending.workspace;
        if (pending.workspace.initiator) {
          const bound = pending.workspace.initiator;
          const [initiator] = await tx.select().from(schema.session).where(and(eq(schema.session.id, bound.sessionId), eq(schema.session.userId, bound.userId), gt(schema.session.expiresAt, new Date()))).for("share");
          if (!initiator || sha256Hex(initiator.token) !== bound.sessionHash) throw invalid();
        }
        const [cfg] = await tx.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, workspaceId)).for("update");
        const [member] = await tx.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, user.id))).for("share");
        const [link] = await tx.select().from(schema.account).where(and(eq(schema.account.providerId, providerId), eq(schema.account.accountId, subject), eq(schema.account.userId, user.id))).for("share");
        if (!user.emailVerified || !cfg?.enabled || cfg.updatedAt.toISOString() !== configStamp || !member || !link) throw invalid();
        const firstVerification = !cfg.verifiedAt;
        if (firstVerification) await tx.update(schema.ssoConfig).set({ verifiedAt: new Date(), updatedAt: new Date() }).where(eq(schema.ssoConfig.workspaceId, workspaceId));
        await audit(tx, {
          workspaceId, actor: userActor(user), action: "sso.signin", targetType: "user", targetId: user.id,
          data: { email: user.email, newUser: false, newMember: false, role: member.role, testSignIn: false, firstVerification, localTotp: true },
        });
      }
      await recordMfaAssurance(currentSession.token, user.id, currentSession.expiresAt, tx);
      await tx.delete(schema.verification).where(eq(schema.verification.id, row.id));
      return { session: currentSession, next: pending.next };
    });
    if (pending.global) {
      const { markFederatedProviderVerified } = await import("./auth-dispatch");
      await markFederatedProviderVerified(pending.global.provider, pending.global.configStamp).catch(() => {});
    }
    return result;
  } catch (error) {
    await db.delete(schema.session).where(eq(schema.session.token, session.token));
    throw error;
  }
}

export function isFederatedSignInPath(path: string) {
  return path.startsWith("/callback/") || path.startsWith("/oauth2/callback/") || path === "/sign-in/social" || path === "/sign-in/oauth2";
}

/** Runs AFTER better-auth's local two-factor hook, BEFORE nextCookies. */
export function federatedMfa(providerStamp?: (provider: string) => Promise<string | null>): BetterAuthPlugin {
  return {
    id: "flowline-federated-mfa",
    init(ctx) {
      const adapter = ctx.adapter;
      return { context: { adapter: {
        ...adapter,
        // Better Auth's internal session middleware calls getSession directly,
        // bypassing endpoint after-hooks. Fence the shared adapter read instead.
        // Cookie caching and secondary session storage must remain disabled.
        async findOne<T>(args: Parameters<typeof adapter.findOne>[0]): Promise<T | null> {
          const row = await adapter.findOne<T>(args);
          if (args.model !== "session" || !row) return row;
          const session = row as unknown as { userId?: unknown; token?: unknown };
          if (typeof session.userId !== "string" || typeof session.token !== "string") return null;
          const [user] = await db.select().from(schema.user).where(eq(schema.user.id, session.userId));
          if (!user || (user.twoFactorEnabled && !(await hasSessionMfa(session.token, user.id)))) return null;
          return row;
        },
      } } };
    },
    hooks: { before: [{
      matcher: (ctx) => ctx.path === "/link-social",
      handler: createAuthMiddleware(async (ctx) => { await bindFederatedLink(ctx, providerStamp); }),
    }], after: [{
      matcher: (ctx) => isFederatedSignInPath(ctx.path ?? "") || ["/sign-in/email", "/sign-in/username", "/sign-in/phone-number", "/two-factor/verify-totp", "/two-factor/verify-backup-code", "/two-factor/verify-otp"].includes(ctx.path ?? ""),
      handler: createAuthMiddleware(async (ctx) => {
        const data = ctx.context.newSession;
        if (!data) return;
        const federated = isFederatedSignInPath(ctx.path);
        // ctx.path is the route pattern ("/callback/:id"); the provider is the route param or the request body.
        const provider = federatedProviderId(ctx);
        const configStamp = federated ? await (providerStamp ?? (await import("./auth-dispatch")).federatedProviderStamp)(provider) : null;
        if (federated && !configStamp) {
          ctx.context.setNewSession(null);
          deleteSessionCookie(ctx, true);
          await ctx.context.internalAdapter.deleteSession(data.session.token);
          throw ctx.redirect("/sign-in?error=signin_expired");
        }
        const [user] = await db.select().from(schema.user).where(eq(schema.user.id, data.user.id));
        if (!user?.twoFactorEnabled) return;
        if (!federated) {
          // The local plugin already completed TOTP/backup verification or
          // authenticated a trusted-device signature before leaving newSession.
          if (data.user.twoFactorEnabled === true) await recordMfaAssurance(data.session.token, user.id, data.session.expiresAt);
          return;
        }
        ctx.context.setNewSession(null);
        deleteSessionCookie(ctx, true);
        await ctx.context.internalAdapter.deleteSession(data.session.token);
        const next = ctx.context.responseHeaders?.get("location") ?? (typeof ctx.body?.callbackURL === "string" ? ctx.body.callbackURL : "/app");
        const token = await createFederatedChallenge(user.id, next, undefined, db, { provider, configStamp: configStamp! });
        ctx.setCookie(FEDERATED_MFA_COOKIE, token, federatedCookieOptions());
        if (ctx.path.includes("/callback/")) throw ctx.redirect("/auth/step-up");
        return ctx.json({ twoFactorRedirect: true, url: "/auth/step-up" });
      }),
    }] },
  };
}
