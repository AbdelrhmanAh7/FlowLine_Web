import { getBillingState } from "@/billing/service";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

/** Billing state for the settings UI: plans from configuration, account, entitlements, current-period usage. */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "billing.view");
  return json(await getBillingState(workspace.id));
});
