import { and, eq, gt, lt } from "drizzle-orm";
import { toNextJsHandler } from "better-auth/next-js";
import { db, schema } from "@/db";
import { auth, authFor, type AuthInstance, type SocialConfig } from "@/lib/auth";
import { sha256Hex } from "./crypto";
import { markPlatformSecretVerified, resolvePlatformCredential } from "./platform-secrets";

/**
 * Sign-in dispatch for better-auth (docs/security/CREDENTIALS_DESIGN.md MUST 18, owner decision 2).
 *
 * - Every request resolves a request-local SNAPSHOT of the sign-in apps (`signin.google`, `signin.github`) from the
 *   platform panel's DB records and uses the better-auth instance built for exactly those revisions. Rotation takes
 *   effect on the next request — no restart, no stale cache, no environment fallback.
 * - Starting a social sign-in records (hash of state → provider, app identity, revision). The callback is dispatched
 *   ONLY with that stored app + revision, and only while it is still accepted: the same app (platform_secret row) at its
 *   current revision, or the previous one inside its grace window. A callback for an unknown/expired/revoked attempt is
 *   refused; a query parameter never selects credentials.
 * - Identity (CXH-02): revisions restart at 1 when a credential is cleared and configured again, so every instance key
 *   and attempt binding carries the platform_secret row id (immutable; a cleared + reconfigured app gets a new row) as
 *   well as the revision. Two different apps can never share a cached better-auth instance.
 */
const PROVIDERS = ["google", "github"] as const;
type Provider = (typeof PROVIDERS)[number];
const ATTEMPT_TTL_MS = 10 * 60_000;

interface SigninApp {
  /** platform_secret.id: the app's immutable identity (a cleared + reconfigured app is a new row). */
  id: string;
  clientId: string;
  secret: string;
  revision: number;
  previous: { secret: string; revision: number; validUntil: Date } | null;
}

async function signinApp(p: Provider): Promise<SigninApp | null> {
  const cred = await resolvePlatformCredential(`signin.${p}`);
  if (!cred?.publicId) return null;
  return { id: cred.id, clientId: cred.publicId, secret: cred.secret, revision: cred.revision, previous: cred.previous };
}

/** Instance-key part of one provider's app: identity AND revision (a revision number alone is reused after a clear). */
function keyPart(p: string, appId: string, revision: number) {
  return `${p}:${appId}:r${revision}`;
}

/** Request-local snapshot of the CURRENT sign-in apps. */
export async function currentSnapshot(): Promise<{ key: string; social: SocialConfig; revisions: Partial<Record<Provider, number>>; appIds: Partial<Record<Provider, string>> }> {
  const social: SocialConfig = {};
  const revisions: Partial<Record<Provider, number>> = {};
  const appIds: Partial<Record<Provider, string>> = {};
  const parts: string[] = [];
  for (const p of PROVIDERS) {
    const app = await signinApp(p);
    if (!app) continue;
    social[p] = { clientId: app.clientId, clientSecret: app.secret };
    revisions[p] = app.revision;
    appIds[p] = app.id;
    parts.push(keyPart(p, app.id, app.revision));
  }
  return { key: parts.join("|"), social, revisions, appIds };
}

/** Public: which sign-in methods are configured right now (read per request). */
export async function signinAvailability() {
  const out: Record<Provider, boolean> = { google: false, github: false };
  for (const p of PROVIDERS) out[p] = Boolean(await signinApp(p));
  return out;
}

/**
 * The instance a CALLBACK must use: built with the revision that started this attempt, if that revision is still
 * accepted. null = refuse.
 */
export async function instanceForCallback(provider: string, state: string | null): Promise<{ instance: AuthInstance; revision: number } | null> {
  if (!state || !(PROVIDERS as readonly string[]).includes(provider)) return null;
  const [attempt] = await db
    .select()
    .from(schema.signinAttempt)
    .where(and(eq(schema.signinAttempt.stateHash, sha256Hex(state)), eq(schema.signinAttempt.provider, provider), gt(schema.signinAttempt.expiresAt, new Date())));
  if (!attempt) return null;
  const app = await signinApp(provider as Provider);
  if (!app) return null; // revoked / cleared since the attempt started
  // The attempt must belong to THIS app (not merely to a revision number a cleared-and-reconfigured app reuses).
  if (!attempt.secretId || attempt.secretId !== app.id) return null;
  let secret: string;
  if (attempt.revision === app.revision) secret = app.secret;
  else if (app.previous && app.previous.revision === attempt.revision && app.previous.validUntil > new Date()) secret = app.previous.secret;
  else return null;
  // Other providers keep their current configuration; only this provider is pinned to the attempt's revision.
  const snap = await currentSnapshot();
  const social: SocialConfig = { ...snap.social, [provider]: { clientId: app.clientId, clientSecret: secret } };
  const key = Object.keys(social)
    .sort()
    .map((p) => (p === provider ? keyPart(p, app.id, attempt.revision) : keyPart(p, snap.appIds[p as Provider]!, snap.revisions[p as Provider]!)))
    .join("|");
  return { instance: authFor(key, social), revision: attempt.revision };
}

async function recordAttempt(provider: string, responseBody: unknown, revision: number | undefined, secretId: string | undefined) {
  if (!revision || !secretId || !(PROVIDERS as readonly string[]).includes(provider)) return;
  const url = (responseBody as { url?: unknown } | null)?.url;
  if (typeof url !== "string") return;
  let state: string | null = null;
  try {
    state = new URL(url).searchParams.get("state");
  } catch {
    return;
  }
  if (!state) return;
  await db.delete(schema.signinAttempt).where(lt(schema.signinAttempt.expiresAt, new Date()));
  await db.insert(schema.signinAttempt).values({ stateHash: sha256Hex(state), provider, revision, secretId, expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS) }).onConflictDoNothing();
}

function refused(): Response {
  const base = (process.env.BETTER_AUTH_URL ?? process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return new Response(null, { status: 302, headers: { location: `${base}/sign-in?error=signin_expired`, "referrer-policy": "no-referrer", "cache-control": "no-store" } });
}

function withNoReferrer(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set("referrer-policy", "no-referrer");
  out.headers.set("cache-control", "no-store");
  return out;
}

/** Handles one /api/auth/* request with the right better-auth instance. */
export async function dispatchAuth(request: Request, method: "GET" | "POST"): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  const callback = /^\/callback\/([a-z]+)$/.exec(path);
  if (callback) {
    const provider = callback[1]!;
    let state = new URL(request.url).searchParams.get("state");
    if (!state && method === "POST") {
      try {
        state = new URLSearchParams(await request.clone().text()).get("state");
      } catch {
        state = null;
      }
    }
    const pinned = await instanceForCallback(provider, state);
    if (!pinned) return refused();
    const res = await toNextJsHandler(pinned.instance)[method](request);
    await db.delete(schema.signinAttempt).where(eq(schema.signinAttempt.stateHash, sha256Hex(state!)));
    // A completed sign-in (redirect without an error and with a session cookie) verifies exactly that revision.
    const location = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400 && !/[?&]error=/.test(location) && /session_token/.test(res.headers.get("set-cookie") ?? "")) {
      await markPlatformSecretVerified(`signin.${provider}`, pinned.revision, "signin").catch(() => {});
    }
    return withNoReferrer(res);
  }
  const snap = await currentSnapshot();
  const instance = snap.key ? authFor(snap.key, snap.social) : auth;
  if (method === "POST" && (path === "/sign-in/social" || path === "/link-social")) {
    let provider = "";
    try {
      provider = String(((await request.clone().json()) as { provider?: unknown }).provider ?? "");
    } catch {
      provider = "";
    }
    const res = await toNextJsHandler(instance).POST(request);
    if (res.ok) {
      try {
        await recordAttempt(provider, await res.clone().json(), snap.revisions[provider as Provider], snap.appIds[provider as Provider]);
      } catch {
        /* non-JSON response: nothing to record */
      }
    }
    return res;
  }
  return toNextJsHandler(instance)[method](request);
}
