import { and, eq, gt, lt } from "drizzle-orm";
import { toNextJsHandler } from "better-auth/next-js";
import { db, schema } from "@/db";
import { auth, authFor, type AuthInstance, type SocialConfig } from "@/lib/auth";
import { sha256Hex } from "./crypto";
import { markPlatformSecretVerified, resolvePlatformCredential } from "./platform-secrets";
import { activeZitadelConfig } from "./zitadel-config";
import type { ZitadelApp } from "./zitadel-auth";
import { zitadelLocalUrl } from "./zitadel-url";
import { capAuthBody } from "./public-body";
import { HttpError } from "./http";

/**
 * Sign-in dispatch for better-auth (docs/security/CREDENTIALS_DESIGN.md MUST 18, owner decision 2).
 *
 * - Google/GitHub sign-in apps come from platform DB records. ZITADEL prefers the complete operator environment tuple
 *   (issuer, client ID and secret), fails closed on partial env configuration, and falls back to its optional DB record
 *   only when the tuple is entirely absent. Each request uses the better-auth instance built for that exact snapshot.
 * - Starting a social sign-in records (hash of state → provider, app identity, revision). The callback is dispatched
 *   ONLY with that stored app + revision, and only while it is still accepted: the same app (platform_secret row) at its
 *   current revision, or the previous one inside its grace window. A callback for an unknown/expired/revoked attempt is
 *   refused; a query parameter never selects credentials.
 * - Identity (CXH-02): revisions restart at 1 when a credential is cleared and configured again, so every instance key
 *   and attempt binding carries the platform_secret row id (immutable; a cleared + reconfigured app gets a new row) as
 *   well as the revision. Two different apps can never share a cached better-auth instance.
 */
const PROVIDERS = ["google", "github", "zitadel"] as const;
type Provider = (typeof PROVIDERS)[number];
const ATTEMPT_TTL_MS = 10 * 60_000;

interface SigninApp {
  /** platform_secret.id: the app's immutable identity (a cleared + reconfigured app is a new row). */
  id: string;
  clientId: string;
  secret: string;
  revision: number;
  previous: { secret: string; revision: number; validUntil: Date } | null;
  source: "environment" | "database";
  issuer?: string;
  issuerRevision?: number;
  /** Used only as an input to a server-private cache key. */
  secretFingerprint?: string;
}

async function signinApp(p: Provider): Promise<SigninApp | null> {
  if (p === "zitadel") {
    const config = await activeZitadelConfig();
    if (!config) return null; // partial/invalid env values deliberately suppress DB fallback
    return {
      id: config.id,
      clientId: config.clientId,
      secret: config.clientSecret,
      revision: config.revision,
      previous: null,
      source: config.source,
      issuer: config.issuer,
      issuerRevision: config.issuerRevision,
      secretFingerprint: config.secretFingerprint,
    };
  }
  const cred = await resolvePlatformCredential(`signin.${p}`);
  if (!cred?.publicId) return null;
  return { id: cred.id, clientId: cred.publicId, secret: cred.secret, revision: cred.revision, previous: cred.previous, source: "database" };
}

/** Instance-key part of one provider's app: identity AND revision (a revision number alone is reused after a clear). */
function keyPart(p: string, appId: string, revision: number) {
  return `${p}:${appId}:r${revision}`;
}

/** Request-local snapshot of the CURRENT sign-in apps. */
export async function currentSnapshot(): Promise<{ key: string; social: SocialConfig; zitadel: ZitadelApp | null; zitadelIssuerRevision?: number; revisions: Partial<Record<Provider, number>>; appIds: Partial<Record<Provider, string>> }> {
  const social: SocialConfig = {};
  let zitadel: ZitadelApp | null = null;
  let zitadelIssuerRevision: number | undefined;
  const revisions: Partial<Record<Provider, number>> = {};
  const appIds: Partial<Record<Provider, string>> = {};
  const parts: string[] = [];
  for (const p of PROVIDERS) {
    const app = await signinApp(p);
    if (!app) continue;
    if (p === "zitadel") {
      if (!app.issuer || !zitadelLocalUrl("discovery")) continue;
      zitadel = { issuer: app.issuer, clientId: app.clientId, clientSecret: app.secret };
      zitadelIssuerRevision = app.issuerRevision;
      parts.push(`issuer:r${app.issuerRevision}`);
      // The fingerprint never leaves this internal factory key; it makes secret-only env changes rebuild auth.
      parts.push(`credential-secret:${app.secretFingerprint}`);
    } else social[p] = { clientId: app.clientId, clientSecret: app.secret };
    revisions[p] = app.revision;
    appIds[p] = app.id;
    parts.push(keyPart(p, app.id, app.revision));
  }
  return { key: parts.length ? sha256Hex(parts.join("|")) : "", social, zitadel, zitadelIssuerRevision, revisions, appIds };
}

/** Public: which sign-in methods are configured right now (read per request). */
export async function signinAvailability() {
  const out: Record<Provider, boolean> = { google: false, github: false, zitadel: false };
  for (const p of ["google", "github"] as const) out[p] = Boolean(await signinApp(p));
  out.zitadel = Boolean(await signinApp("zitadel")) && Boolean(zitadelLocalUrl("discovery"));
  return out;
}

/**
 * The instance a CALLBACK must use: built with the revision that started this attempt, if that revision is still
 * accepted. null = refuse.
 */
export async function instanceForCallback(provider: string, state: string | null): Promise<{ instance: AuthInstance; revision: number; source: "environment" | "database" } | null> {
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
  if (provider === "zitadel") {
    const [fence] = await db.select().from(schema.verification).where(eq(schema.verification.identifier, `signin-issuer:${sha256Hex(state)}`));
    if (!fence || fence.expiresAt <= new Date() || fence.value !== JSON.stringify([app.issuer, app.issuerRevision, app.clientId])) return null;
  }
  let secret: string;
  if (attempt.revision === app.revision) secret = app.secret;
  else if (app.previous && app.previous.revision === attempt.revision && app.previous.validUntil > new Date()) secret = app.previous.secret;
  else return null;
  // Other providers keep their current configuration; only this provider is pinned to the attempt's revision.
  const snap = await currentSnapshot();
  const social: SocialConfig = { ...snap.social };
  let zitadel = snap.zitadel;
  if (provider === "zitadel") {
    if (!zitadel) return null;
    zitadel = { ...zitadel, clientSecret: secret };
  } else social[provider] = { clientId: app.clientId, clientSecret: secret };
  const key = `${snap.key}|callback:${keyPart(provider, app.id, attempt.revision)}`;
  return { instance: await authFor(key, social, zitadel ?? undefined), revision: attempt.revision, source: app.source };
}

async function recordAttempt(provider: string, responseBody: unknown, revision: number | undefined, secretId: string | undefined, zitadel: ZitadelApp | null, issuerRevision: number | undefined) {
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
  if (provider === "zitadel" && zitadel) {
    const app = await signinApp("zitadel");
    // Re-read only to fence a concurrently replaced issuer; never bind a start to a new snapshot.
    if (app?.id !== secretId || app.revision !== revision || app.issuer !== zitadel.issuer || app.clientId !== zitadel.clientId || app.issuerRevision !== issuerRevision) return;
    await db.insert(schema.verification).values({ id: crypto.randomUUID(), identifier: `signin-issuer:${sha256Hex(state)}`, value: JSON.stringify([app.issuer, app.issuerRevision, app.clientId]), expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS) });
  }
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
  if (method === "POST") {
    try {
      request = await capAuthBody(request);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return Response.json({ code: error.code }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
  }
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
    await db.delete(schema.verification).where(eq(schema.verification.identifier, `signin-issuer:${sha256Hex(state!)}`));
    // A completed sign-in (redirect without an error and with a session cookie) verifies exactly that revision.
    const location = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400 && !/[?&]error=/.test(location) && /session_token/.test(res.headers.get("set-cookie") ?? "")) {
      if (provider !== "zitadel" || pinned.source === "database") await markPlatformSecretVerified(`signin.${provider}`, pinned.revision, "signin").catch(() => {});
    }
    return withNoReferrer(res);
  }
  const socialPost = method === "POST" && (path === "/sign-in/social" || path === "/link-social");
  let provider = "";
  if (socialPost) {
    // Better Auth (better-call) also parses form-encoded bodies, which would skip the check below. Only JSON is
    // accepted on these two paths (every Flowline client sends JSON); anything else fails closed before body parsing.
    const noStore = { "cache-control": "no-store" };
    if (!/^application\/json\s*(;|$)/i.test(request.headers.get("content-type") ?? ""))
      return Response.json({ code: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415, headers: noStore });
    let body: { provider?: unknown; idToken?: unknown } | null;
    try {
      body = (await request.clone().json()) as { provider?: unknown; idToken?: unknown } | null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ code: "INVALID_JSON_BODY" }, { status: 400, headers: noStore });
    provider = String(body.provider ?? "");
    // Better Auth also accepts caller-supplied ID tokens at /sign-in/social. ZITADEL sign-in
    // must use the server-created authorization-code state, nonce and PKCE verifier instead.
    if (provider === "zitadel" && Object.hasOwn(body, "idToken")) return Response.json({ code: "ZITADEL_CODE_FLOW_REQUIRED" }, { status: 400, headers: noStore });
  }
  const snap = await currentSnapshot();
  const instance = snap.key ? await authFor(snap.key, snap.social, snap.zitadel ?? undefined) : auth;
  if (socialPost) {
    const res = await toNextJsHandler(instance).POST(request);
    if (res.ok) {
      try {
        await recordAttempt(provider, await res.clone().json(), snap.revisions[provider as Provider], snap.appIds[provider as Provider], snap.zitadel, snap.zitadelIssuerRevision);
      } catch {
        /* non-JSON response: nothing to record */
      }
    }
    return res;
  }
  return toNextJsHandler(instance)[method](request);
}
