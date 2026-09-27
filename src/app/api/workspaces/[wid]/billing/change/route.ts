import { z } from "zod";
import { changePlan } from "@/billing/service";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

/** Upgrade/downgrade: changes the subscription price at the provider; the webhook applies it locally. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "billing.manage");
  const { planId } = await parseBody(req, z.object({ planId: z.string().min(1) }));
  await changePlan(user, workspace.id, planId);
  return json({ ok: true });
});
