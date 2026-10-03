import type { ZodType } from "zod";
import { auth } from "@/lib/auth";
import { capBody, HttpError, jsonNoStore, notFound, parseBody, route } from "./http";
import { requestHeaders } from "./platform-access";
import { setupChallengeFrom } from "./platform-setup";

/** Setup endpoints: exact Origin, JSON only, small bodies, no-store/no-referrer. Values are never echoed back. */
function assertOrigin(req: Request) {
  const allowed = new Set<string>();
  for (const u of [process.env.FLOWLINE_PUBLIC_URL, process.env.BETTER_AUTH_URL]) {
    try {
      if (u) allowed.add(new URL(u).origin);
    } catch {
      /* ignore */
    }
  }
  const origin = req.headers.get("origin");
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "CROSS_SITE_REQUEST", "Cross-site request refused");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON");
}

export function setupSecured(res: Response) {
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}

export async function readSetupBody<B>(req: Request, schema: ZodType<B>): Promise<B> {
  assertOrigin(req);
  const capped = await capBody(req, 8 * 1024, new HttpError(413, "BODY_TOO_LARGE", "Request body is too large"));
  try {
    return await parseBody(capped, schema);
  } catch (e) {
    if (e instanceof HttpError && e.code === "VALIDATION") throw new HttpError(400, "VALIDATION", "Invalid request");
    throw e;
  }
}

/** A mutation that needs a live setup session (404 without one) and, optionally, the signed-in user. */
export function setupWrite<B>(schema: ZodType<B>, fn: (ch: NonNullable<Awaited<ReturnType<typeof setupChallengeFrom>>>, body: B, user: { id: string; email: string; emailVerified: boolean; sessionToken: string; sessionExpiresAt: Date } | null) => Promise<unknown>) {
  return route(async (req: Request) => {
    const ch = await setupChallengeFrom(req);
    if (!ch) throw notFound();
    const body = await readSetupBody(req, schema);
    const s = await auth.api.getSession({ headers: await requestHeaders(req) }).catch(() => null);
    return setupSecured(jsonNoStore(await fn(ch, body, s ? { id: s.user.id, email: s.user.email, emailVerified: s.user.emailVerified, sessionToken: s.session.token, sessionExpiresAt: s.session.expiresAt } : null)));
  });
}
