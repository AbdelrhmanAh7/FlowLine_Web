import { z } from "zod";
import { track } from "@/server/telemetry";
import { isUuid, requireFlow, requireUser } from "@/server/access";
import { decideProposal } from "@/server/copilot";
import { json, notFound, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ fid: string; pid: string }> };

/** Approve (saves a draft revision; never runs or publishes) or reject a Copilot proposal. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  if (!isUuid(p.pid)) throw notFound("Proposal not found");
  const { flow } = await requireFlow(user, p.fid, "flow.edit");
  const b = await parseBody(req, z.object({ decision: z.enum(["approve", "reject"]), confirmRemovals: z.boolean().optional() }));
  const proposal = await decideProposal(user, flow.id, p.pid, b);
  track("copilot_decided", { workspaceId: flow.workspaceId, userId: user.id }, { decision: b.decision, kind: "edit" });
  return json({ proposal });
});
