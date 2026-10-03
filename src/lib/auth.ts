import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { redactString, safeErrorText } from "@/server/redact";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { wrapAccountTokenEncryption } from "@/server/auth-token-adapter";
import { allowSignUp, BETA_REFUSAL, betaMode } from "@/server/beta";
import { issueAccountToken } from "@/server/email/flows";
import { track } from "@/server/telemetry";
import { zitadelProvider, type ZitadelApp } from "@/server/zitadel-auth";
import { federatedMfa } from "@/server/federated-mfa";

/**
 * better-auth, built as a REVISION-KEYED FACTORY (docs/security/CREDENTIALS_DESIGN.md MUST 18, owner decision 2).
 *
 * The Google/GitHub sign-in apps are platform credentials (`signin.google`, `signin.github`) managed in the admin
 * panel. ZITADEL may be configured by the complete operator environment tuple or, when absent, its optional DB record.
 * Each request takes a snapshot of the current sign-in configuration (see src/server/auth-dispatch.ts). The base `auth`
 * instance (no social providers) serves sessions, email/password and two-factor.
 */
export type SocialConfig = Record<string, { clientId: string; clientSecret: string }>;

function buildAuth(socialProviders: SocialConfig, zitadel?: ZitadelApp) {
  return betterAuth({
    appName: "Flowline",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    // Social-login tokens are encrypted at rest (v2 envelope, row-bound) by this adapter transformation.
    database: ((options: never) =>
      wrapAccountTokenEncryption(
        drizzleAdapter(db, {
          provider: "pg",
          schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, twoFactor: schema.twoFactor },
        })(options) as never,
      )) as unknown as ReturnType<typeof drizzleAdapter>,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      sendResetPassword: async ({ user }, request) => { await issueAccountToken("reset", user, request); },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 24 * 60 * 60,
      // better-auth's own link carries the sign-up's callbackURL; Flowline sends its own single-use token instead and
      // keeps only that (same-origin, validated) path so the verify page can continue where sign-up started.
      sendVerificationEmail: async ({ user, url }, request) => {
        let callbackURL: string | null = null;
        try { callbackURL = new URL(url).searchParams.get("callbackURL"); } catch { /* no callback */ }
        await issueAccountToken("verify", user, request, { callbackURL });
      },
    },
    socialProviders,
    // Intentional, documented security tradeoff (not changed here): with ZITADEL configured no provider links implicitly.
    account: { accountLinking: { disableImplicitLinking: Boolean(zitadel) } },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      // Relaxed only for the isolated test stack (E2E signs up many users); the email flows keep their own
      // PostgreSQL-backed limits everywhere (src/server/email/flows.ts).
      enabled: process.env.FLOWLINE_ENV !== "test",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 10 }, "/sign-up/email": { window: 60, max: 10 } },
    },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    // Private beta (P4-12): every new account — email or Google/GitHub — must be invited, hold a beta code, or be an admin.
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const c = ctx as { body?: { betaCode?: unknown }; headers?: Headers; request?: Request } | null | undefined;
            const body = c?.body;
            const decision = await allowSignUp(user.email, typeof body?.betaCode === "string" ? body.betaCode : null, betaMode(c?.headers ?? c?.request?.headers));
            if (!decision.ok) throw new APIError("FORBIDDEN", { message: BETA_REFUSAL, code: "BETA_INVITE_REQUIRED" });
          },
          after: async (user) => {
            track("signup_completed", { userId: user.id }, { via: betaMode() });
          },
        },
      },
    },
    // Better Auth logs failed DB queries verbatim (bound params include session tokens): scrub before logging.
    logger: {
      log: (level, message, ...args) => {
        const text = [message, ...args.map((a) => (a instanceof Error ? safeErrorText(a) : typeof a === "string" ? a : ""))].filter(Boolean).join(" ");
        (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[auth] ${redactString(text)}`);
      },
    },
    // TOTP two-factor (required for platform admins before the admin panel unlocks; available to every account).
    plugins: [twoFactor({ issuer: "Flowline" }), ...(zitadel ? [genericOAuth({ config: [zitadelProvider(zitadel)] })] : []), federatedMfa(), nextCookies()],
  });
}

/** Sessions, email/password, two-factor. Carries NO social providers (see `authFor`). */
export const auth = buildAuth({});

export type AuthInstance = typeof auth;
export type Session = typeof auth.$Infer.Session;

interface CacheEntry { instance: AuthInstance; /** Set only for an instance whose ZITADEL provider failed to load: it expires and is rebuilt. */ retryAt?: number }
const instances = new Map<string, CacheEntry>();
const building = new Map<string, Promise<AuthInstance>>();
/** How long an instance whose ZITADEL discovery failed is reused before the next attempt (bounds load on the IdP). */
export const ZITADEL_RETRY_MS = 5_000;

/**
 * The instance for one sign-in-app snapshot (`key` identifies each app by its immutable platform_secret id AND its
 * revision — a revision number alone restarts at 1 after a clear, CXH-02). Instances are immutable per key; a rotation
 * or a different app produces a new key, so no request ever sees another app's or a half-updated configuration.
 * Bounded cache.
 *
 * ZITADEL discovery runs once while the instance initializes and a failure only logs and skips the provider. We await
 * that initialization: an instance without its provider is returned (sign-in for it fails closed) but cached only for
 * `ZITADEL_RETRY_MS`, so a transient outage recovers on its own instead of lasting until the next configuration change.
 */
export async function authFor(key: string, social: SocialConfig, zitadel?: ZitadelApp): Promise<AuthInstance> {
  if (!key) return auth;
  const hit = instances.get(key);
  if (hit && (hit.retryAt === undefined || hit.retryAt > Date.now())) return hit.instance;
  const pending = building.get(key);
  if (pending) return pending;
  const build = (async () => {
    const instance = buildAuth(social, zitadel) as AuthInstance;
    let ready = true;
    if (zitadel) {
      try {
        const ctx = await instance.$context;
        ready = ctx.socialProviders.some((p) => p.id === "zitadel");
      } catch {
        ready = false;
      }
    }
    instances.delete(key);
    instances.set(key, ready ? { instance } : { instance, retryAt: Date.now() + ZITADEL_RETRY_MS });
    if (instances.size > 8) instances.delete(instances.keys().next().value!);
    return instance;
  })().finally(() => building.delete(key));
  building.set(key, build);
  return build;
}
