import { oauthConfig } from "@/lib/auth";
import { betaMode } from "@/server/beta";
import { json } from "@/server/http";

/** Public: which sign-in methods are actually configured on this server, and whether sign-up is invitation-only. */
export async function GET(request: Request) {
  return json({ email: true, google: oauthConfig.google, github: oauthConfig.github, betaMode: betaMode(request.headers) });
}
