import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { usageSummary } from "@/server/usage";

type Ctx = { params: Promise<{ wid: string }> };

/** This month's usage from the durable ledger (real events only). */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  return json(await usageSummary(db, workspace.id));
});
