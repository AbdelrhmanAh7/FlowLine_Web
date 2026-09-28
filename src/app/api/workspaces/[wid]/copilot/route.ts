import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { proposeNewFlow } from "@/server/copilot";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

/** "Create with Copilot": a proposal for a new flow. No flow exists until the proposal is approved. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "flow.edit");
  const b = await parseBody(req, z.object({ request: z.string().min(1).max(2000) }));
  return json({ proposal: await proposeNewFlow(user, workspace.id, b.request) }, { status: 201 });
});
