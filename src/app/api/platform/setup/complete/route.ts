import { z } from "zod";
import { HttpError } from "@/server/http";
import { completeSetup } from "@/server/platform-setup";
import { setupWrite } from "@/server/platform-setup-http";

export const dynamic = "force-dynamic";

/** Atomic completion: bound identity + verified email + enrolled TOTP + a fresh code → platform admin; setup closes. */
export const POST = setupWrite(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), async (ch, body, user) => {
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue");
  await completeSetup(ch, user, body.code);
  return { ok: true };
});
