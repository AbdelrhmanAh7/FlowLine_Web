import { NextResponse } from "next/server";
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

/** Wraps a route handler with consistent JSON error responses. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid request", details: err.issues } }, { status: 400 });
      }
      console.error("[api] unhandled", err);
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on our side" } }, { status: 500 });
    }
  };
}
