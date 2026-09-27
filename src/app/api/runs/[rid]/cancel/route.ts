import { requireRun, requireUser } from "@/server/access";
import { json, route } from "@/server/http";
import { cancelRun } from "@/server/runs";

type Ctx = { params: Promise<{ rid: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { run } = await requireRun(user, (await params).rid, "editor");
  return json(await cancelRun(user, run.id));
});
