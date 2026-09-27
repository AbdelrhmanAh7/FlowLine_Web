import { NextResponse } from "next/server";
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

/**
 * Reads the request body with a hard byte cap enforced WHILE streaming (Content-Length can be absent or wrong,
 * e.g. chunked uploads), then returns an equivalent Request whose body is safe to parse (formData/json).
 */
export async function capBody(req: Request, maxBytes: number, tooLarge: HttpError): Promise<Request> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw tooLarge;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge;
      }
      chunks.push(value);
    }
  }
  return new Request(req.url, { method: req.method, headers: req.headers, body: size ? Buffer.concat(chunks) : null });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
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
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request", details: err.issues } }, { status: 400 });
      }
      console.error("[api] unhandled", safeErrorText(err));
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on our side" } }, { status: 500 });
    }
  };
}
