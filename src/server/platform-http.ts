import { createHmac, timingSafeEqual } from "node:crypto";
import type { ZodType } from "zod";
import { capBody, HttpError, jsonNoStore, parseBody, route } from "./http";
import { requirePlatformAdmin, requireStepUp, type PlatformAdminContext } from "./platform-access";
import type { PlatformActor } from "./platform-secrets";
import { checkRate } from "./rate-limit";

/**
 * HTTP contract for the platform panel (docs/security/CREDENTIALS_DESIGN.md MUST 10):
 * - `route()` (CSRF defence, request id, bounded error codes) plus, for every mutation: an EXACT configured Origin
 *   (missing / null / other origins are refused — `Sec-Fetch-Site` alone is not enough here), a session-bound CSRF
 *   token header, `Content-Type: application/json`, a streaming body cap, a TOTP step-up and a distributed rate limit.
 * - Every response is `Cache-Control: no-store` + `Referrer-Policy: no-referrer`.
 * - Non-admins get 404 before anything else happens.
 */
const MAX_BODY = 16 * 1024;

function allowedOrigins() {
  const out = new Set<string>();
  for (const u of [process.env.FLOWLINE_PUBLIC_URL, process.env.BETTER_AUTH_URL]) {
    try {
      if (u) out.add(new URL(u).origin);
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

/** CSRF token bound to one session (HMAC of the session-token hash with the auth secret). */
export function csrfTokenFor(sessionTokenHash: string) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "flowline-dev-secret").update(`platform-csrf:${sessionTokenHash}`).digest("base64url");
}

/** Secret-management mutations need the EXACT configured Origin (missing / "null" / other origins are refused). */
export function assertExactOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || !allowedOrigins().has(origin)) throw new HttpError(403, "CROSS_SITE_REQUEST", "Cross-site request refused");
}

function assertStrictMutation(req: Request, sessionTokenHash: string) {
  assertExactOrigin(req);
  const token = req.headers.get("x-flowline-csrf") ?? "";
  const expected = csrfTokenFor(sessionTokenHash);
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new HttpError(403, "CSRF_TOKEN_INVALID", "Reload the page and try again");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON");
}

export function adminActor(ctx: PlatformAdminContext): PlatformActor {
  return { userId: ctx.user.id, label: ctx.user.email, assurance: "session_totp_stepup" };
}

type Ctx<P> = { params: Promise<P> };

function secured(res: Response) {
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}

/** GET handlers: admin only (no step-up). */
export function platformRead<P = Record<string, never>>(fn: (ctx: PlatformAdminContext, req: Request, params: P) => Promise<unknown>) {
  return route(async (req: Request, c: Ctx<P>) => {
    const ctx = await requirePlatformAdmin(req);
    return secured(jsonNoStore(await fn(ctx, req, (await c?.params) ?? ({} as P))));
  });
}

/** Mutations: admin + strict origin + CSRF token + JSON + body cap + step-up + rate limit. */
export function platformWrite<B, P = Record<string, never>>(schema: ZodType<B>, fn: (ctx: PlatformAdminContext, body: B, params: P) => Promise<unknown>, opts: { stepUp?: boolean } = {}) {
  return route(async (req: Request, c: Ctx<P>) => {
    const ctx = await requirePlatformAdmin(req);
    assertStrictMutation(req, ctx.session.tokenHash);
    if (opts.stepUp !== false) await requireStepUp(ctx);
    if (!(await checkRate(`platform-write:${ctx.user.id}`, 20, 60))) throw new HttpError(429, "RATE_LIMITED", "Too many changes. Wait a minute and try again.");
    const capped = await capBody(req, MAX_BODY, new HttpError(413, "BODY_TOO_LARGE", "Request body is too large"));
    const body = await parseBodyQuiet(capped, schema);
    return secured(jsonNoStore(await fn(ctx, body, (await c?.params) ?? ({} as P))));
  });
}

/**
 * Like parseBody, but validation errors carry ONLY field paths and fixed messages — never the submitted value (a
 * too-short secret must not come back in the 400 body).
 */
async function parseBodyQuiet<B>(req: Request, schema: ZodType<B>): Promise<B> {
  try {
    return await parseBody(req, schema);
  } catch (e) {
    if (e instanceof HttpError && e.code === "VALIDATION") {
      const issues = Array.isArray(e.details) ? (e.details as { path?: unknown[] }[]).map((i) => ({ path: (i.path ?? []).map(String) })) : [];
      throw new HttpError(400, "VALIDATION", "Invalid request", issues);
    }
    throw e;
  }
}

export { MAX_BODY as PLATFORM_MAX_BODY };
