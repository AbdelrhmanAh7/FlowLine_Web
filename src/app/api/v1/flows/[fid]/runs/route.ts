import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isUuid } from "@/server/access";
import { authenticateApiKey, requireScope } from "@/server/apikeys";
import { HttpError, json, notFound, parseBody, route } from "@/server/http";
import { checkRunRate } from "@/server/rate-limit";
import { enqueueRunEx } from "@/server/runs";

type Ctx = { params: Promise<{ fid: string }> };

const body = z.object({ input: z.record(z.string(), z.unknown()).optional() }).strict();

/**
 * POST /api/v1/flows/{id}/runs — start a run with an API key (scope runs:write).
 * Live keys run the PUBLISHED version; test keys run a snapshot of the current draft.
 * `Idempotency-Key` header dedupes retries. Returns the execution id; poll GET /api/v1/runs/{id}.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const p = await authenticateApiKey(req);
  await requireScope(p, "runs:write");
  await checkRunRate(`apikey:${p.keyId}`);
  const fid = (await params).fid;
  if (!isUuid(fid)) throw notFound("Flow not found");
  const [flow] = await db.select().from(schema.flow).where(and(eq(schema.flow.id, fid), eq(schema.flow.workspaceId, p.workspaceId), isNull(schema.flow.deletedAt)));
  if (!flow) throw notFound("Flow not found");
  if (p.mode === "live" && !flow.publishedVersionId) throw new HttpError(409, "NOT_PUBLISHED", "Live keys run published versions only — publish the flow first (or use a test key)");
  const b = await parseBody(req, body);
  const idem = req.headers.get("idempotency-key")?.trim();
  if (idem && (idem.length > 200 || !/^[\x21-\x7e]+$/.test(idem))) throw new HttpError(400, "VALIDATION", "Idempotency-Key must be printable and ≤200 chars");
  const [creator] = await db.select().from(schema.user).where(eq(schema.user.id, p.actingUserId));
  const { run, duplicate } = await enqueueRunEx(creator ? { id: creator.id, email: creator.email, name: creator.name } : null, flow.id, {
    triggerKind: "api",
    usePublished: p.mode === "live",
    input: b.input,
    triggerRef: idem ? `${p.keyId}:${idem}` : undefined,
    apiKeyId: p.keyId,
    actingUserId: p.actingUserId,
  });
  return json({ id: run.id, number: run.number, status: run.status, duplicate, statusUrl: `/api/v1/runs/${run.id}` }, { status: duplicate ? 200 : 202 });
});
