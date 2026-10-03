import { z } from "zod";
import { betaMode, previewSignUp } from "@/server/beta";
import { checkSharedRate } from "@/server/email/flows";
import { json, parseBody, route } from "@/server/http";
import { admitPublicBody, PUBLIC_JSON_MAX_BYTES } from "@/server/public-body";

const body = z.object({ email: z.email().max(254), code: z.string().max(64).nullish() });

/**
 * Public sign-up pre-check for the private beta: may this email create an account (invitation, admin allowlist, or
 * the given beta code)? The answer is advisory for the form — the sign-up itself decides again and is the only thing
 * that consumes a code use. Rate limited per email and per IP (shared PostgreSQL counters, like the email flows) so
 * it can't be used to sweep for invited addresses or guess codes.
 */
export const POST = route(async (request) => {
  await admitPublicBody(request, "beta");
  const input = await parseBody(request, body, PUBLIC_JSON_MAX_BYTES);
  const mode = betaMode(request.headers);
  if (mode === "open") return json({ allowed: true, mode });
  const email = input.email.trim().toLowerCase();
  await checkSharedRate("beta-check", email, request, { email: 10, ip: 30 }, { code: "BETA_CHECK_RATE_LIMIT", message: "Too many sign-up checks. Try again in an hour." });
  const decision = await previewSignUp(email, input.code ?? null, mode);
  return json({ allowed: decision.ok, mode });
});
