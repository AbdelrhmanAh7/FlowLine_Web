import { z } from "zod";
import { db } from "@/db";
import { getAiConnection, inferenceTest, limitKeyOps, testAiConnection } from "@/ai/hub/connections";
import { requireUser, requireWorkspace } from "@/server/access";
import { HttpError, jsonNoStore, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; cid: string }> };

const body = z.union([
  z.object({ kind: z.literal("metadata") }),
  // An inference test costs money: it only runs when the owner explicitly confirms it.
  z.object({ kind: z.literal("inference"), modelId: z.string().min(1).max(200), confirm: z.literal(true) }),
]);

/** Test connection (owner): metadata-only by default; a disclosed one-shot inference test on explicit request. */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid, "ai.manage");
  const conn = await getAiConnection(db, workspace.id, cid);
  const b = await parseBody(req, body).catch((e) => {
    if (e instanceof HttpError && e.status !== 400) throw e;
    throw new HttpError(400, "VALIDATION", 'Use {"kind":"metadata"} or {"kind":"inference","modelId":…,"confirm":true}');
  });
  await limitKeyOps(user.id, conn.id);
  if (b.kind === "metadata") return jsonNoStore(await testAiConnection(db, conn));
  return jsonNoStore(await inferenceTest(db, user.id, workspace, conn, b.modelId));
});
