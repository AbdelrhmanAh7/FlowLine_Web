import { requireFlow, requireUser } from "@/server/access";
import { json, route } from "@/server/http";
import { rotateWebhookSecret } from "@/server/publish";

type Ctx = { params: Promise<{ fid: string }> };

/** Issues a new signing secret. It is shown ONCE; the old one stops working immediately. */
export const POST = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "editor");
  return json(await rotateWebhookSecret(flow.id));
});
