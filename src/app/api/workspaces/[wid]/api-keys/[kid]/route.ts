import { requireUser, requireWorkspace } from "@/server/access";
import { revokeApiKey } from "@/server/apikeys";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; kid: string }> };

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "apikey.manage");
  return json({ apiKey: await revokeApiKey(user, workspace.id, p.kid) });
});
