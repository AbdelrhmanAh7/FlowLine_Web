import { requireRun, requireUser } from "@/server/access";
import { json, route } from "@/server/http";
import { getRunDetail } from "@/server/runs";

type Ctx = { params: Promise<{ rid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { run } = await requireRun(user, (await params).rid);
  return json({ run: await getRunDetail(run.id) });
});
