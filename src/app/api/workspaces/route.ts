import { z } from "zod";
import { requireUser } from "@/server/access";
import { json, parseBody, route } from "@/server/http";
import { createWorkspace, listWorkspaces } from "@/server/workspaces";

export const GET = route(async () => {
  const user = await requireUser();
  return json({ workspaces: await listWorkspaces(user) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { name } = await parseBody(req, z.object({ name: z.string() }));
  const ws = await createWorkspace(user, name);
  return json({ workspace: ws }, { status: 201 });
});
