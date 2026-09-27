import { reconcileUsage } from "@/billing/service";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { monthStart } from "@/server/usage";

type Ctx = { params: Promise<{ wid: string }> };

/** Reports this period's ledger totals to the payment provider (idempotent per period + metric). */
export const POST = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "billing.manage");
  return json(await reconcileUsage(workspace.id, monthStart()));
});
