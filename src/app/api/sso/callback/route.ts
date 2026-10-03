import { NextResponse } from "next/server";
import { HttpError } from "@/server/http";
import { completeSso, SSO_STATE_COOKIE, ssoSessionCookie } from "@/server/sso";
import { auth } from "@/lib/auth";
import { SSO_LINK_COOKIE } from "@/server/sso-link";

export const dynamic = "force-dynamic";

/**
 * OIDC redirect target. On success the user lands in the workspace with a real
 * better-auth session cookie; on any failure they return to sign-in with the
 * reason — no partial sessions.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.FLOWLINE_PUBLIC_URL ?? url.origin).replace(/\/+$/, "");
  const fail = (message: string) => NextResponse.redirect(`${base}/sign-in?sso_error=${encodeURIComponent(message)}`);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");
  // The IdP's error is a code, not text to show verbatim (no content injection into the sign-in page).
  if (providerError) return fail(/^[a-z_]{1,40}$/.test(providerError) ? `The identity provider refused the sign-in (${providerError})` : "The identity provider refused the sign-in");
  if (!state || !code) return fail("The identity provider didn't finish the sign-in");
  const bound = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${SSO_STATE_COOKIE}=`))?.slice(SSO_STATE_COOKIE.length + 1);
  if (!bound || bound !== state) return fail("This sign-in was started in a different browser — start again");
  try {
    const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
    const result = await completeSso({ state, code, sessionToken: session?.session.token });
    if (result.configurationVerified) {
      const res = NextResponse.redirect(`${base}/w/${result.slug}/settings?tab=sso`);
      res.cookies.set(SSO_STATE_COOKIE, "", { path: "/api/sso", maxAge: 0 });
      res.headers.set("cache-control", "no-store");
      res.headers.set("referrer-policy", "no-referrer");
      return res;
    }
    if (result.linkRequired) {
      const res = NextResponse.redirect(`${base}/sso/link`);
      res.cookies.set(SSO_LINK_COOKIE, result.linkRequired, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https:"), path: "/", maxAge: 600 });
      res.cookies.set(SSO_STATE_COOKIE, "", { path: "/api/sso", maxAge: 0 });
      res.headers.set("cache-control", "no-store");
      res.headers.set("referrer-policy", "no-referrer");
      return res;
    }
    const res = NextResponse.redirect(`${base}/w/${result.slug}/flows`);
    const cookie = await ssoSessionCookie(result.sessionToken);
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    res.cookies.set(SSO_STATE_COOKIE, "", { path: "/api/sso", maxAge: 0 });
    return res;
  } catch (e) {
    if (e instanceof HttpError && e.code === "SSO_LINK_INVALID") return fail("auth.ssoLinkError");
    if (e instanceof HttpError && e.code === "SSO_STATE_INVALID") return fail("auth.ssoRestart");
    if (e instanceof HttpError && e.code === "SSO_ACCOUNT_EXISTS") return fail("auth.ssoAccountExists");
    if (e instanceof HttpError && e.code === "SSO_EMAIL_OWNERSHIP_REQUIRED") return fail("auth.ssoOwnershipRequired");
    return fail(e instanceof HttpError ? e.message : "SSO sign-in couldn't be completed");
  }
}
