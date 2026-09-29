import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { redactString, safeErrorText } from "@/server/redact";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { wrapAccountTokenEncryption } from "@/server/auth-token-adapter";
import { allowSignUp, BETA_REFUSAL, betaMode } from "@/server/beta";
import { issueAccountToken } from "@/server/email/flows";
import { track } from "@/server/telemetry";

/**
 * better-auth, built as a REVISION-KEYED FACTORY (docs/security/CREDENTIALS_DESIGN.md MUST 18, owner decision 2).
 *
 * The Google/GitHub sign-in apps are platform credentials (`signin.google`, `signin.github`) managed in the admin
 * panel — never read from the environment. Each request takes a snapshot of the current sign-in revisions and uses an
 * instance built for exactly that snapshot (see src/server/auth-dispatch.ts), so rotating a sign-in app needs no
 * restart. The base `auth` instance (no social providers) serves sessions, email/password and two-factor.
 */
export type SocialConfig = Record<string, { clientId: string; clientSecret: string }>;

function buildAuth(socialProviders: SocialConfig) {
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
    plugins: [nextCookies(), twoFactor({ issuer: "Flowline" })],
  });
}

/** Sessions, email/password, two-factor. Carries NO social providers (see `authFor`). */
export const auth = buildAuth({});

export type AuthInstance = typeof auth;
export type Session = typeof auth.$Infer.Session;

const instances = new Map<string, AuthInstance>();

/**
 * The instance for one sign-in-app snapshot (`key` identifies the exact revisions). Instances are immutable per key;
 * a rotation produces a new key, so no request ever sees a half-updated configuration. Bounded cache.
 */
export function authFor(key: string, social: SocialConfig): AuthInstance {
  if (!key) return auth;
  const hit = instances.get(key);
  if (hit) return hit;
  const instance = buildAuth(social) as AuthInstance;
  instances.set(key, instance);
  if (instances.size > 8) instances.delete(instances.keys().next().value!);
  return instance;
}
