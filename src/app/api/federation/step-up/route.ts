import { NextResponse } from "next/server";
import { z } from "zod";
import { assertConfirmationPost, confirmationCsrf, requestCookie } from "@/server/auth-confirmation";
import { completeFederatedChallenge, federatedChallenge, FEDERATED_MFA_COOKIE } from "@/server/federated-mfa";
import { capBody, HttpError, jsonNoStore, parseBody, route } from "@/server/http";
import { ssoSessionCookie } from "@/server/sso";

export const dynamic = "force-dynamic";
export const GET = route(async (req: Request) => {
  const token = requestCookie(req, FEDERATED_MFA_COOKIE);
  await federatedChallenge(token);
  return jsonNoStore({ csrf: await confirmationCsrf(token) });
});
export const POST = route(async (req: Request) => {
  const token = requestCookie(req, FEDERATED_MFA_COOKIE);
  await assertConfirmationPost(req, token);
  const bounded = await capBody(req, 2048, new HttpError(413, "BODY_TOO_LARGE", "Request too large"));
  const { code } = await parseBody(bounded, z.object({ code: z.string().regex(/^\d{6}$/) }).strict());
  const result = await completeFederatedChallenge(token, code);
  const cookie = await ssoSessionCookie(result.session.token);
  const res = NextResponse.json({ next: result.next }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  res.cookies.set(FEDERATED_MFA_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
