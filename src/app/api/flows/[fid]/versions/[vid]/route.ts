import { isUuid, requireFlow, requireUser } from "@/server/access";
import { getVersion } from "@/server/flows";
import { json, notFound, route } from "@/server/http";

type Ctx = { params: Promise<{ fid: string; vid: string }> };

/** Inspect one immutable version (the exact definition historical runs used). */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  if (!isUuid(p.vid)) throw notFound("Version not found");
  const { flow } = await requireFlow(user, p.fid);
  return json({ version: await getVersion(flow.id, p.vid) });
});
