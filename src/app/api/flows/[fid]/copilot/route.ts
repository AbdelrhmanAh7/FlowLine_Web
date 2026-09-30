import { z } from "zod";
import { track } from "@/server/telemetry";
import { requireFlow, requireUser } from "@/server/access";
import { listProposals, propose } from "@/server/copilot";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ fid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid);
  return json({ proposals: await listProposals(flow.id) });
});

/** Ask Copilot for a proposal. Nothing is saved to the flow or run until the proposal is approved. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "flow.edit");
  const b = await parseBody(req, z.object({ request: z.string().min(1).max(2000) }));
  const proposal = await propose(user, flow.id, b.request);
  track("copilot_requested", { workspaceId: flow.workspaceId, userId: user.id }, { kind: "edit", valid: proposal.status === "proposed" });
  return json({ proposal }, { status: 201 });
});
