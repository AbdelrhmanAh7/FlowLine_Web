import { z } from "zod";
import { cancel } from "@/billing/service";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

/** Cancels the subscription, at period end or immediately. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "billing.manage");
  const { atPeriodEnd } = await parseBody(req, z.object({ atPeriodEnd: z.boolean() }));
  await cancel(user, workspace.id, atPeriodEnd);
  return json({ ok: true });
});
