import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { symmetricEncrypt } from "better-auth/crypto";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { sha256Hex } from "@/server/crypto";
import { csrfTokenFor } from "@/server/platform-http";
import { ssoSessionCookie } from "@/server/sso";
import { totpCodeFor } from "@/server/totp";

/** Test support for the platform admin boundary: real better-auth sessions, real TOTP secrets, real CSRF tokens. */
export const ORIGIN = new URL(process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3100").origin;

export interface TestSession {
  userId: string;
  email: string;
  token: string;
  cookie: string;
}

export async function makeVerifiedUser(prefix = "u", opts: { verified?: boolean } = {}) {
  const id = randomUUID();
  const email = `${prefix}-${randomUUID().slice(0, 8)}@flowline-test.local`;
  await db.insert(schema.user).values({ id, email, name: prefix, emailVerified: opts.verified ?? true });
  return { id, email, name: prefix };
}

/** A real better-auth session row + the signed cookie better-auth expects. */
export async function sessionFor(user: { id: string; email: string }): Promise<TestSession> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const c = await ssoSessionCookie(session.token);
  return { userId: user.id, email: user.email, token: session.token, cookie: `${c.name}=${encodeURIComponent(c.value)}` };
}

/** Enrols a verified TOTP authenticator directly (same storage as better-auth's two-factor plugin). Returns the raw secret. */
export async function enrolTotp(userId: string): Promise<string> {
  const ctx = await auth.$context;
  const raw = randomBytes(20).toString("base64url").slice(0, 32);
  const secret = await symmetricEncrypt({ key: ctx.secretConfig as never, data: raw });
  const backupCodes = await symmetricEncrypt({ key: ctx.secretConfig as never, data: "[]" });
  await db.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  await db.insert(schema.twoFactor).values({ id: randomUUID(), secret, backupCodes, userId, verified: true });
  await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, userId));
  return raw;
}

/** A complete platform admin (verified email, TOTP enrolled, active admin row) with a fresh session. */
export async function makeAdmin(prefix = "admin") {
  const user = await makeVerifiedUser(prefix);
  const secret = await enrolTotp(user.id);
  await db.insert(schema.platformAdmin).values({ userId: user.id, status: "active", grantedBy: "test" });
  const session = await sessionFor(user);
  return { user, secret, session };
}

/** A code for `offsetSteps` time-steps from now (the verifier accepts ±1 step, so +1 gives a second, unused code). */
export function code(secret: string, offsetSteps = 0) {
  return totpCodeFor(secret, Date.now() + offsetSteps * 30_000);
}

/** Lets a test reuse the current step again (tests run inside one 30 s window). */
export async function resetTotpReplay(userId: string) {
  await db.update(schema.platformAdmin).set({ lastTotpStep: null }).where(eq(schema.platformAdmin.userId, userId));
}

/** A browser-like mutation to a platform route: exact Origin, the session-bound CSRF token, JSON. */
export function platformReq(path: string, session: TestSession | null, init: { method?: string; body?: unknown; headers?: Record<string, string>; noCsrf?: boolean; origin?: string | null } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (session && !init.noCsrf) headers["x-flowline-csrf"] = csrfTokenFor(sha256Hex(session.token));
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

export async function jsonOf(res: Response) {
  const text = await res.text();
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null, text, headers: res.headers };
  } catch {
    return { status: res.status, body: null, text, headers: res.headers };
  }
}
