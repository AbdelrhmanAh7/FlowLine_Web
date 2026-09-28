import { z } from "zod";
import { VALUE_MAX_BYTES } from "@/engine/expression";
import { requireFlow, requireUser } from "@/server/access";
import { HttpError, json, route } from "@/server/http";
import { checkRunRate } from "@/server/rate-limit";
import { enqueueRunEx, listRuns } from "@/server/runs";

type Ctx = { params: Promise<{ fid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid);
  return json({ runs: await listRuns(flow.workspaceId, { flowId: flow.id, limit: 20 }) });
});

const body = z
  .object({
    input: z.unknown().optional(),
    /** Client-generated id per Run click: a double-click or network retry returns the same run. */
    clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  })
  .optional();

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "flow.run");
  const text = await req.text();
  if (text.length > VALUE_MAX_BYTES + 1024) throw new HttpError(413, "INPUT_TOO_LARGE", `Run input must be under ${Math.round(VALUE_MAX_BYTES / 1024)}KB`);
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : undefined;
  } catch {
    throw new HttpError(400, "BAD_JSON", "Request body must be JSON");
  }
  const parsed = body.parse(raw);
  if (!parsed?.clientRequestId) await checkRunRate(user.id);
  const { run, duplicate } = await enqueueRunEx(user, flow.id, {
    input: parsed?.input,
    triggerKind: "manual",
    triggerRef: parsed?.clientRequestId ? `click:${parsed.clientRequestId}` : undefined,
  });
  if (!duplicate && parsed?.clientRequestId) await checkRunRate(user.id);
  return json({ run, duplicate }, { status: duplicate ? 200 : 202 });
});
