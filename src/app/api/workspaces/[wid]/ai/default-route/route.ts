import { z } from "zod";
import { db } from "@/db";
import { setDefaultRoute } from "@/ai/hub/connections";
import { requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { jsonNoStore, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

const body = z.object({ route: z.object({ connectionId: z.string().uuid(), modelId: z.string().min(1).max(200) }).nullable() });

/** Workspace default AI route (owner): used by AI steps without their own route, agents and Copilot. */
export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "ai.manage");
  const b = await parseBody(req, body);
  await setDefaultRoute(db, workspace.id, b.route);
  await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "ai.default_route_changed", targetType: "workspace", targetId: workspace.id, data: { route: b.route } });
  return jsonNoStore({ defaultRoute: b.route });
});
