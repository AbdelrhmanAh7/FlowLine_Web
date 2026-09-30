import { z } from "zod";
import { jsonNoStore, route } from "@/server/http";
import { redeemChallenge, SETUP_COOKIE } from "@/server/platform-setup";
import { readSetupBody, setupSecured } from "@/server/platform-setup-http";

export const dynamic = "force-dynamic";

/**
 * Redeems the operator's setup code (POSTed from the form — never in a URL) into a short setup session cookie.
 * Rate-limited per client and globally; every attempt is audited.
 */
export const POST = route(async (req) => {
  const body = await readSetupBody(req, z.object({ token: z.string().min(20).max(200) }).strict());
  const client = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
  const { cookie, expiresAt } = await redeemChallenge(body.token, client);
  const res = setupSecured(jsonNoStore({ ok: true, expiresAt }));
  const secure = (process.env.FLOWLINE_PUBLIC_URL ?? "").startsWith("https:");
  res.headers.append("set-cookie", `${SETUP_COOKIE}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${secure ? "; Secure" : ""}`);
  return res;
});
