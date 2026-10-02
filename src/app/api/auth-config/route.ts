import { signinAvailability } from "@/server/auth-dispatch";
import { betaMode } from "@/server/beta";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Public: which sign-in methods are configured on this server RIGHT NOW (platform panel, read per request), and whether sign-up is invitation-only. */
export async function GET(request: Request) {
  const s = await signinAvailability();
  return json({ email: true, google: s.google, github: s.github, zitadel: s.zitadel, betaMode: betaMode(request.headers) });
}
