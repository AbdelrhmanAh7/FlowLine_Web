import { requireUser, requireWorkspace } from "@/server/access";
import { jsonNoStore, notFound, route } from "@/server/http";
import { previewWorkspaceAppChange } from "@/server/oauth-apps";
import { OAUTH_FAMILIES, type OAuthFamily } from "@/server/platform-purposes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ wid: string; family: string }> };

/** How many active connections switching or removing this app would send to reconnect (shown before confirming). */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "oauthapp.manage");
  if (!(p.family in OAUTH_FAMILIES)) throw notFound("Unknown provider");
  return jsonNoStore(await previewWorkspaceAppChange(workspace.id, p.family as OAuthFamily));
});
