import { db } from "@/db";
import { listAiConnections } from "@/ai/hub/connections";
import { aiStatus, legacyReport, publicProviders, retiredProviders } from "@/ai/hub/status";
import { requireUser, requireWorkspace } from "@/server/access";
import { can } from "@/server/permissions";
import { jsonNoStore, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const dynamic = "force-dynamic";

/**
 * AI Providers overview for a member: provider definitions, this workspace's connections (metadata only — never a
 * key), the default route, what the caller may do, and pre-hub items that need migrating.
 */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace, role } = await requireWorkspace(user, (await params).wid);
  return jsonNoStore({
    providers: publicProviders(),
    retired: retiredProviders(),
    connections: await listAiConnections(db, workspace.id),
    defaultRoute: workspace.aiDefaultRoute ?? null,
    policy: workspace.aiPolicy,
    status: await aiStatus(db, workspace, role),
    legacy: await legacyReport(db, workspace.id),
    canManage: can(role, "ai.manage"),
    canUse: can(role, "ai.use"),
  });
});
