import { z } from "zod";
import { isUuid, requireUser, requireWorkspace } from "@/server/access";
import { decideNewFlowProposal } from "@/server/copilot";
import { json, notFound, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; pid: string }> };

/** Approve (creates the flow as a draft; never runs or publishes) or reject a new-flow proposal. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  if (!isUuid(p.pid)) throw notFound("Proposal not found");
  const { workspace } = await requireWorkspace(user, p.wid, "flow.edit");
  const b = await parseBody(req, z.object({ decision: z.enum(["approve", "reject"]) }));
  return json({ proposal: await decideNewFlowProposal(user, workspace.id, p.pid, b) });
});
