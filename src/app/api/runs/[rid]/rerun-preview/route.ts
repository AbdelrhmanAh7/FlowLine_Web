import { requireRun, requireUser } from "@/server/access";
import { json, route } from "@/server/http";
import { rerunPreview } from "@/server/runs";

type Ctx = { params: Promise<{ rid: string }> };

/** What a re-run from a step will do: steps that run again (with side-effect class), reused steps, repeat-effect warnings. */
export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { run } = await requireRun(user, (await params).rid);
  const url = new URL(req.url);
  return json(await rerunPreview(run, url.searchParams.get("fromNodeId") ?? "", url.searchParams.get("revision") === "latest" ? "latest" : "original"));
});
