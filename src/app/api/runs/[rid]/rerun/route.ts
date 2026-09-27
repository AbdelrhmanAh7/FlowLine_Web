import { z } from "zod";
import { requireRun, requireUser } from "@/server/access";
import { json, parseBody, route } from "@/server/http";
import { checkRunRate } from "@/server/rate-limit";
import { rerunFromStep } from "@/server/runs";

type Ctx = { params: Promise<{ rid: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { run } = await requireRun(user, (await params).rid, "editor");
  checkRunRate(user.id);
  const { fromNodeId, revision } = await parseBody(req, z.object({ fromNodeId: z.string().min(1).max(64), revision: z.enum(["original", "latest"]).default("original") }));
  const next = await rerunFromStep(user, run, fromNodeId, revision);
  return json({ run: next }, { status: 202 });
});
