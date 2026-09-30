import { eq } from "drizzle-orm";
import { track } from "@/server/telemetry";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getCurrentSession } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { completeOAuth } from "@/server/connections";
import { HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Bounded outcome codes carried back to the integrations page (MUST 21): never the provider's `error_description`,
 * never a free-form message. The page translates the code.
 */
const KNOWN_CODES = new Set([
  "OAUTH_STATE_INVALID",
  "OAUTH_EXCHANGE_FAILED",
  "OAUTH_APP_CHANGED",
  "OAUTH_ACCESS_REVOKED",
  "OAUTH_NOT_CONFIGURED",
  "DIFFERENT_ACCOUNT",
  "DIFFERENT_PROVIDER",
  "CONNECTION_REJECTED",
  "PROVIDER_UNREACHABLE",
  "EGRESS_BLOCKED",
  "NOT_FOUND",
]);
const PROVIDER_DENIALS = new Set(["access_denied", "consent_required", "interaction_required", "login_required"]);

function noReferrer(res: NextResponse) {
  // The callback URL carries the code and state: never leak it through Referer, never cache it.
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("cache-control", "no-store");
  return res;
}

/** OAuth redirect target. Verifies state (single use, same user + session, unexpired), re-checks access, exchanges the code (PKCE), stores tokens encrypted. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.FLOWLINE_PUBLIC_URL ?? url.origin).replace(/\/$/, "");
  const session = await getCurrentSession();
  if (!session) return noReferrer(NextResponse.redirect(`${base}/sign-in`));
  const { user, sessionToken } = session;
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");
  const back = async (wsId: string | null, params: Record<string, string>) => {
    let slug: string | undefined;
    if (wsId) [{ slug }] = await db.select({ slug: schema.workspace.slug }).from(schema.workspace).where(eq(schema.workspace.id, wsId));
    const q = new URLSearchParams(params).toString();
    return noReferrer(NextResponse.redirect(`${base}${slug ? `/w/${slug}/integrations` : "/app"}?${q}`));
  };
  if (providerError || !code) return back(null, { oauth: "error", code: providerError ? (PROVIDER_DENIALS.has(providerError) ? "PROVIDER_DENIED" : "PROVIDER_ERROR") : "NO_CODE" });
  try {
    const r = await completeOAuth(db, { state, code, userId: user.id, sessionToken });
    await audit(db, { workspaceId: r.workspaceId, actor: userActor(user), action: r.reconnected ? "integration.reconnected" : "integration.connected", targetType: "connection", targetId: r.connectionId, data: { via: "oauth" } });
    track("integration_connected", { workspaceId: r.workspaceId, userId: user.id }, { via: "oauth", status: r.reconnected ? "reconnected" : "connected" });
    return back(r.workspaceId, { oauth: r.reconnected ? "reconnected" : "connected", connection: r.connectionId });
  } catch (e) {
    const c = e instanceof HttpError && KNOWN_CODES.has(e.code) ? e.code : "UNKNOWN";
    return back(null, { oauth: "error", code: c });
  }
}
