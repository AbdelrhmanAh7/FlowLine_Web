import { NextResponse } from "next/server";
import { correlationId, track, withRequestContext } from "./telemetry";
import { safeErrorText } from "@/server/redact";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, "NOT_FOUND", what);
export const forbidden = (msg = "You don't have permission to do that") => new HttpError(403, "FORBIDDEN", msg);
export const unauthorized = () => new HttpError(401, "UNAUTHORIZED", "Sign in to continue");

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** JSON for endpoints that handle secrets (AI connections): never cached by browsers or proxies. */
export function jsonNoStore<T>(data: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return NextResponse.json(data, { ...init, headers });
}

/** Total body-read budget, not an idle timeout. The beta ingress uses the same duration. */
export const BODY_READ_TIMEOUT_MS = 10_000;

/**
 * Reads the request body with a hard byte cap and deadline WHILE streaming (Content-Length can be absent or wrong,
 * e.g. chunked uploads), then returns an equivalent Request whose body is safe to parse (formData/json).
 */
export async function capBody(req: Request, maxBytes: number, tooLarge: HttpError): Promise<Request> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw tooLarge;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    const timeout = new HttpError(408, "BODY_READ_TIMEOUT", "Request body took too long to arrive");
    const expires = performance.now() + BODY_READ_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(timeout), BODY_READ_TIMEOUT_MS);
    });
    try {
      for (;;) {
        // Also check elapsed time when already-queued chunks keep the timer from running.
        if (performance.now() >= expires) throw timeout;
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (performance.now() >= expires) throw timeout;
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw tooLarge;
        chunks.push(value);
      }
    } catch (error) {
      // A tee/adapter can leave cancellation pending forever. Never let cleanup hold the response open.
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
  }
  return new Request(req.url, { method: req.method, headers: req.headers, body: size ? Buffer.concat(chunks) : null });
}

/** General JSON ceiling; upload routes retain their explicit content/overhead budget. */
export const JSON_BODY_MAX_BYTES = 1024 * 1024;

export async function parseBody<T>(req: Request, schema: ZodType<T>, maxBytes = JSON_BODY_MAX_BYTES): Promise<T> {
  // Outside the JSON catch: a streaming overflow must remain 413, never BAD_JSON.
  const capped = await capBody(req, maxBytes, new HttpError(413, "BODY_TOO_LARGE", "Request body is too large"));
  let body: unknown;
  try {
    body = await capped.json();
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body must be JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "VALIDATION", "Invalid request", result.error.issues);
  return result.data;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth (the session cookie is already SameSite=Lax): a state-changing request that
 * carries cookies must come from the app's own origin. Cookie-less calls (API keys, provider webhooks)
 * aren't affected — they have no ambient authority to abuse.
 */
function assertSameOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;
  if (!req.headers.get("cookie")) return;
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return;
  const origin = req.headers.get("origin");
  const allowed = new Set<string>();
  for (const u of [process.env.BETTER_AUTH_URL, process.env.FLOWLINE_PUBLIC_URL, req.url]) {
    try {
      if (u) allowed.add(new URL(u).origin);
    } catch {
      /* ignore malformed */
    }
  }
  if (origin && allowed.has(origin)) return;
  throw new HttpError(403, "CROSS_SITE_REQUEST", "Cross-site request refused");
}

/** Wraps a route handler with consistent JSON error responses. */
export function route<C>(handler: Handler<C>): Handler<C> {
  // Every API response carries a correlation id (X-Request-Id from the proxy, or a new one) for debugging (P4-15).
  return (req, ctx) =>
    withRequestContext(req.headers.get("x-request-id"), async () => {
      const res = await handleRoute(handler, req, ctx);
      res.headers.set("x-request-id", correlationId()!);
      return res;
    });
}

async function handleRoute<C>(handler: Handler<C>, req: Request, ctx: C): Promise<Response> {
  try {
    assertSameOrigin(req);
    return await handler(req, ctx);
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status >= 500) track("api_error", {}, { code: err.code, httpStatus: err.status });
      return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request", details: err.issues } }, { status: 400 });
    }
    console.error("[api] unhandled", `request=${correlationId()}`, safeErrorText(err));
    track("api_error", {}, { code: "INTERNAL", httpStatus: 500 });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on our side", requestId: correlationId() } }, { status: 500 });
  }
}
