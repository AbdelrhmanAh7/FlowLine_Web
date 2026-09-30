import { z } from "zod";
import { db } from "@/db";
import { createAiConnection, limitKeyOps, listAiConnections } from "@/ai/hub/connections";
import { requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { jsonNoStore, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  return jsonNoStore({ connections: await listAiConnections(db, workspace.id) });
});

const body = z.object({
  provider: z.string().max(40),
  label: z.string().max(80).default(""),
  apiKey: z.string().max(600),
  settings: z.record(z.string().max(40), z.string().max(300)).default({}),
  /** Required for providers whose coding-plan keys are forbidden (Z.ai, Moonshot, MiniMax, Alibaba). */
  attestPayAsYouGo: z.boolean().optional(),
});

/**
 * Add an AI connection (owner). The key is checked with a metadata-only call (model listing — no billable
 * inference), encrypted at rest and never returned: the response carries only a masked hint.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "ai.manage");
  const b = await parseBody(req, body);
  await limitKeyOps(user.id);
  const connection = await createAiConnection(db, user.id, workspace.id, b);
  await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "ai.connected", targetType: "ai_connection", targetId: connection.id, data: { provider: b.provider } });
  return jsonNoStore({ connection }, { status: 201 });
});
