import { z } from "zod";
import { requireFlow, requireUser } from "@/server/access";
import { HttpError, json, route } from "@/server/http";
import { enqueueRun, listRuns } from "@/server/runs";

type Ctx = { params: Promise<{ fid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid);
  return json({ runs: await listRuns(flow.workspaceId, { flowId: flow.id, limit: 20 }) });
});

const body = z.object({ input: z.unknown().optional() }).optional();

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "editor");
  const text = await req.text();
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : undefined;
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body must be JSON");
  }
  const parsed = body.parse(raw);
  const run = await enqueueRun(user, flow.id, { input: parsed?.input });
  return json({ run }, { status: 202 });
});
