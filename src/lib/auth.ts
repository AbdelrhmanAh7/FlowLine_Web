import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { redactString, safeErrorText } from "@/server/redact";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { allowSignUp, BETA_REFUSAL } from "@/server/beta";

export const oauthConfig = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
};

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (oauthConfig.google) socialProviders.google = { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! };
if (oauthConfig.github) socialProviders.github = { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! };

export const auth = betterAuth({
  appName: "Flowline",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Phase 1 has no email delivery; verification is documented as a Phase 3 item.
    requireEmailVerification: false,
  },
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
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
          const body = (ctx as { body?: { betaCode?: unknown } } | null | undefined)?.body;
          const decision = await allowSignUp(user.email, typeof body?.betaCode === "string" ? body.betaCode : null);
          if (!decision.ok) throw new APIError("FORBIDDEN", { message: BETA_REFUSAL, code: "BETA_INVITE_REQUIRED" });
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
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
