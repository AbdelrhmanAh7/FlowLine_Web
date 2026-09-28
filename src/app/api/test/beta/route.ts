import { z } from "zod";
import { createBetaCode, TEST_BETA_COOKIE } from "@/server/beta";
import { testFeaturesEnabled } from "@/server/faults";
import { json, notFound, parseBody, route } from "@/server/http";

const body = z.object({ mode: z.enum(["open", "invite_only"]).optional(), createCode: z.boolean().optional() });

/**
 * TEST ENVIRONMENT ONLY — 404 everywhere else. Switches the private-beta mode for the CALLER's browser context only
 * (a cookie honoured solely under FLOWLINE_ENV=test), so parallel E2E tests don't affect each other; optionally mints
 * a single-use beta access code.
 */
export const POST = route(async (req) => {
  if (!testFeaturesEnabled()) throw notFound();
  const b = await parseBody(req, body);
  const code = b.createCode ? (await createBetaCode({ label: "e2e", maxUses: 1, expiresInDays: 1 })).code : undefined;
  const res = json({ ok: true, ...(code ? { code } : {}) });
  if (b.mode) res.cookies.set(TEST_BETA_COOKIE, b.mode, { path: "/", sameSite: "lax", httpOnly: true });
  return res;
});
