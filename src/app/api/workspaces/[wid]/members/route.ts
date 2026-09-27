import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { listMembers } from "@/server/workspaces";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  return json({ members: await listMembers(workspace.id) });
});
