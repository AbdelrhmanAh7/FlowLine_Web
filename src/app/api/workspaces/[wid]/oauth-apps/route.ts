import { requireUser, requireWorkspace } from "@/server/access";
import { jsonNoStore, route } from "@/server/http";
import { listWorkspaceApps } from "@/server/oauth-apps";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ wid: string }> };

/** The workspace's own OAuth apps (owner-only, `oauthapp.manage`): client ids and metadata — never the secrets. */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "oauthapp.manage");
  return jsonNoStore(await listWorkspaceApps(workspace.id));
});
