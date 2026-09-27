import { oauthConfig } from "@/lib/auth";
import { json } from "@/server/http";

/** Public: which sign-in methods are actually configured on this server. */
export async function GET() {
  return json({ email: true, google: oauthConfig.google, github: oauthConfig.github });
}
