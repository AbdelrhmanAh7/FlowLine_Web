import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { searchKnowledge } from "@/server/knowledge";

type Ctx = { params: Promise<{ wid: string }> };

/** Search the workspace's knowledge (for the Knowledge page preview). Results carry source + chunk citations. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "knowledge.view");
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 300);
  return json({ hits: await searchKnowledge(db, workspace.id, q, { limit: 8 }) });
});
