import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { HttpError } from "@/server/http";
import { SSO_STATE_COOKIE, startSso } from "@/server/sso";

export const dynamic = "force-dynamic";

/**
 * Starts an SSO sign-in: redirects to the workspace's identity provider.
 * Only works for workspaces with an enabled config, or for an owner running a
 * test sign-in from the settings page — anything else lands back on sign-in
 * with "SSO isn't set up for that workspace".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.FLOWLINE_PUBLIC_URL ?? url.origin).replace(/\/+$/, "");
  const fail = (message: string) => NextResponse.redirect(`${base}/sign-in?sso_error=${encodeURIComponent(message)}`);
  const slug = (url.searchParams.get("workspace") ?? "").trim().toLowerCase();
  if (!slug) return fail("SSO isn't set up for that workspace");
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const user = session?.user ?? null;
  try {
    const { url: target, state } = await startSso({ slug, email: url.searchParams.get("email") ?? undefined, user, sessionToken: session?.session.token });
    const res = NextResponse.redirect(target);
    // Binds the sign-in to this browser: the callback only completes where it started (no login CSRF).
    res.cookies.set(SSO_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https:"), path: "/api/sso", maxAge: 600 });
    return res;
  } catch (e) {
    return fail(e instanceof HttpError ? e.message : "SSO sign-in couldn't be started");
  }
}
