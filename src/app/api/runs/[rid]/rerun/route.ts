import { z } from "zod";
import { requireRun, requireUser } from "@/server/access";
import { json, parseBody, route } from "@/server/http";
import { checkRunRate } from "@/server/rate-limit";
import { rerunFromStep } from "@/server/runs";

type Ctx = { params: Promise<{ rid: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { run } = await requireRun(user, (await params).rid, "flow.run");
  await checkRunRate(user.id);
  const { fromNodeId, revision, clientRequestId } = await parseBody(req, z.object({
    fromNodeId: z.string().min(1).max(64),
    revision: z.enum(["original", "latest"]).default("original"),
    clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  }));
  const next = await rerunFromStep(user, run, fromNodeId, revision, clientRequestId);
  return json({ run: next }, { status: 202 });
});
