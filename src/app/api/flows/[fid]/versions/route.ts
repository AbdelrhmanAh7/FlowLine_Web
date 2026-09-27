import { requireFlow, requireUser } from "@/server/access";
import { listVersions } from "@/server/flows";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ fid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid);
  return json({ versions: await listVersions(flow.id) });
});
