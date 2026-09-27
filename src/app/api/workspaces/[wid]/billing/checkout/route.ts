import { z } from "zod";
import { startCheckout } from "@/billing/service";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

/** Starts a provider checkout session for a plan; returns the URL to send the owner to. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "billing.manage");
  const { planId } = await parseBody(req, z.object({ planId: z.string().min(1) }));
  return json(await startCheckout(user, workspace.id, planId));
});
