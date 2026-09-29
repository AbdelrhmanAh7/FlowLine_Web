import { requireUser, requireWorkspace } from "@/server/access";
import { jsonNoStore, notFound, route } from "@/server/http";
import { probeWorkspaceApp } from "@/server/oauth-apps";
import { assertExactOrigin } from "@/server/platform-http";
import { OAUTH_FAMILIES, type OAuthFamily } from "@/server/platform-purposes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ wid: string; family: string }> };

/** "Test": rejects obviously wrong client credentials only. The app is VERIFIED only after a real Connect. */
export const POST = route(async (req, { params }: Ctx) => {
  assertExactOrigin(req);
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "oauthapp.manage");
  if (!(p.family in OAUTH_FAMILIES)) throw notFound("Unknown provider");
  return jsonNoStore(await probeWorkspaceApp(user, workspace.id, p.family as OAuthFamily));
});
