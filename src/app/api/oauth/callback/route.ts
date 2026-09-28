import { eq } from "drizzle-orm";
import { track } from "@/server/telemetry";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { completeOAuth } from "@/server/connections";
import { HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

/** OAuth redirect target. Verifies state (single use, same user, unexpired), exchanges the code (PKCE), stores tokens encrypted. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.FLOWLINE_PUBLIC_URL ?? url.origin).replace(/\/$/, "");
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${base}/sign-in`);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");
  const back = async (wsId: string | null, params: Record<string, string>) => {
    let slug: string | undefined;
    if (wsId) [{ slug }] = await db.select({ slug: schema.workspace.slug }).from(schema.workspace).where(eq(schema.workspace.id, wsId));
    const q = new URLSearchParams(params).toString();
    return NextResponse.redirect(`${base}${slug ? `/w/${slug}/integrations` : "/app"}?${q}`);
  };
  if (providerError || !code) return back(null, { oauth: "error", message: providerError ?? "No authorization code returned" });
  try {
    const r = await completeOAuth(db, { state, code, userId: user.id });
    await audit(db, { workspaceId: r.workspaceId, actor: userActor(user), action: r.reconnected ? "integration.reconnected" : "integration.connected", targetType: "connection", targetId: r.connectionId, data: { via: "oauth" } });
    track("integration_connected", { workspaceId: r.workspaceId, userId: user.id }, { via: "oauth", status: r.reconnected ? "reconnected" : "connected" });
    return back(r.workspaceId, { oauth: r.reconnected ? "reconnected" : "connected", connection: r.connectionId });
  } catch (e) {
    const message = e instanceof HttpError ? e.message : "The connection could not be completed";
    return back(null, { oauth: "error", message });
  }
}
