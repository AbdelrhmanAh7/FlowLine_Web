import { db } from "@/db";
import { listPickerModels } from "@/ai/hub/discovery";
import { requireUser, requireWorkspace } from "@/server/access";
import { jsonNoStore, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const dynamic = "force-dynamic";

/** Model picker source: only models on connections the caller's role may use (ai.use + the connection's use_roles). */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace, role } = await requireWorkspace(user, (await params).wid, "ai.use");
  return jsonNoStore({ models: await listPickerModels(db, workspace, role) });
});
