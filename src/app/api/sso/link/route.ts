import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertConfirmationPost, confirmationCsrf, requestCookie } from "@/server/auth-confirmation";
import { capBody, HttpError, jsonNoStore, parseBody, route } from "@/server/http";
import { confirmSsoLink, sendSsoLinkVerification, ssoLinkDetails, SSO_LINK_COOKIE } from "@/server/sso-link";

export const dynamic = "force-dynamic";
async function context(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) throw new HttpError(401, "UNAUTHORIZED", "Sign in again");
  const token = requestCookie(req, SSO_LINK_COOKIE);
  if (!token) throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO");
  return { token, sessionToken: session.session.token };
}
export const GET = route(async (req: Request) => {
  const { token, sessionToken } = await context(req);
  const details = await ssoLinkDetails(token, sessionToken);
  return jsonNoStore({ issuer: details.intent.issuer, needsTotp: details.needsTotp, needsPassword: details.needsPassword, mailboxVerified: details.mailboxVerified, csrf: await confirmationCsrf(sessionToken) });
});
export const POST = route(async (req: Request) => {
  const { token, sessionToken } = await context(req);
  await assertConfirmationPost(req, sessionToken);
  const bounded = await capBody(req, 4096, new HttpError(413, "BODY_TOO_LARGE", "Request too large"));
  const body = await parseBody(bounded, z.union([z.object({ action: z.literal("verify-email") }), z.object({ confirm: z.literal(true), password: z.string().max(128).optional(), code: z.string().regex(/^\d{6}$/).optional() })]));
  if ("action" in body) {
    await sendSsoLinkVerification(token, sessionToken, req);
    return jsonNoStore({ sent: true });
  }
  const result = await confirmSsoLink(token, sessionToken, body);
  const res = NextResponse.json({ next: `/w/${result.slug}/flows` }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  res.cookies.set(SSO_LINK_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
