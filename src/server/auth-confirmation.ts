import { createHmac, timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth";
import { HttpError } from "./http";

/** Purpose-separated CSRF token, bound to the pending challenge or initiating session. */
export async function confirmationCsrf(binding: string) {
  const ctx = await auth.$context;
  return createHmac("sha256", ctx.secret).update(`federation-confirm:${binding}`).digest("base64url");
}

export async function assertConfirmationPost(req: Request, binding: string) {
  const origins = [process.env.FLOWLINE_PUBLIC_URL, process.env.BETTER_AUTH_URL].filter(Boolean).map((u) => new URL(u!).origin);
  if (req.method !== "POST" || !origins.includes(req.headers.get("origin") ?? ""))
    throw new HttpError(403, "CROSS_SITE_REQUEST", "Cross-site request refused");
  const expected = Buffer.from(await confirmationCsrf(binding));
  const actual = Buffer.from(req.headers.get("x-flowline-csrf") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new HttpError(403, "CSRF_TOKEN_INVALID", "Reload and confirm again");
}

export function requestCookie(req: Request, name: string) {
  const value = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  try { return value ? decodeURIComponent(value) : ""; } catch { return ""; }
}
