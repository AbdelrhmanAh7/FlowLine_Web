import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sha256Hex } from "@/server/crypto";
import type { FlowGraph } from "@/engine/types";
import { verifyGithubSignature, verifyWebhookSignature, WEBHOOK_MAX_BYTES } from "@/server/publish";
import { enqueueRunEx } from "@/server/runs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });

/**
 * Public webhook receiver.
 * - Signature: `x-flowline-signature: t=<unix>,v1=<hmac-sha256 hex of "<t>.<event id>.<raw body>">`, ±5 min.
 *   GitHub scheme: `X-Hub-Signature-256`; a signature already accepted is refused (replay).
 * - Dedupe: `x-flowline-event-id` is required; the same id returns the original run (200).
 *   Reusing an id with a different body is rejected (409).
 * - The event record and its run are written in ONE transaction, so an accepted
 *   event always has a run (no loss after acceptance). Runs start in receipt order.
 * - While the flow is paused (broken connection) events are recorded but not run.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > WEBHOOK_MAX_BYTES) return reply(413, { error: "Payload too large (256KB max)" });
  const raw = await req.text();
  if (raw.length > WEBHOOK_MAX_BYTES) return reply(413, { error: "Payload too large (256KB max)" });

  const [ep] = await db.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.token, token));
  if (!ep || !ep.active) return reply(404, { error: "Unknown webhook" });

  // The signature scheme comes from the PUBLISHED version's trigger config.
  const [pub] = await db
    .select({ graph: schema.flowVersion.graph })
    .from(schema.flow)
    .innerJoin(schema.flowVersion, eq(schema.flowVersion.id, schema.flow.publishedVersionId))
    .where(eq(schema.flow.id, ep.flowId));
  const trig = (pub?.graph as FlowGraph | undefined)?.nodes.find((n) => n.type === "trigger.webhook");
  const scheme = (trig?.data.config as { signatureScheme?: string } | undefined)?.signatureScheme === "github" ? "github" : "flowline";
  const eventId = (req.headers.get(scheme === "github" ? "x-github-delivery" : "x-flowline-event-id") ?? "").trim();
  if (!eventId || eventId.length > 200 || !/^[\x21-\x7e]+$/.test(eventId)) {
    return reply(400, { error: `${scheme === "github" ? "X-GitHub-Delivery" : "x-flowline-event-id"} header is required (printable, ≤200 chars)` });
  }
  let signedAt = new Date();
  let signature: string | null = null;
  if (scheme === "github") {
    const g = verifyGithubSignature(ep.secretEnc, ep.keyId, req.headers.get("x-hub-signature-256"), raw);
    if (!g.ok) return reply(401, { error: `Invalid signature: ${g.reason}` });
    signature = req.headers.get("x-hub-signature-256")!.toLowerCase();
  } else {
    const sig = verifyWebhookSignature(ep.secretEnc, ep.keyId, req.headers.get("x-flowline-signature"), raw, eventId);
    if (!sig.ok) return reply(401, { error: `Invalid signature: ${sig.reason}` });
    signedAt = new Date(sig.t * 1000);
  }

  let body: unknown = raw;
  if ((req.headers.get("content-type") ?? "").includes("json") || scheme === "github") {
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, { error: "Body is not valid JSON" });
    }
  }
  const bodySha = sha256Hex(raw);

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.webhookEvent)
        .values({ endpointId: ep.id, eventId, bodySha256: bodySha, signedAt, signature, status: "accepted" })
        .onConflictDoNothing({ target: [schema.webhookEvent.endpointId, schema.webhookEvent.eventId] })
        .returning();
      if (inserted.length === 0) {
        const [prev] = await tx.select().from(schema.webhookEvent).where(and(eq(schema.webhookEvent.endpointId, ep.id), eq(schema.webhookEvent.eventId, eventId)));
        if (prev!.bodySha256 !== bodySha) return { status: 409, body: { error: "This event id was already used with a different payload" } };
        return { status: 200, body: { duplicate: true, runId: prev!.runId, eventStatus: prev!.status } };
      }
      const event = inserted[0]!;
      const [flow] = await tx.select().from(schema.flow).where(eq(schema.flow.id, ep.flowId));
      if (!flow || flow.deletedAt || !flow.publishedVersionId) {
        await tx.update(schema.webhookEvent).set({ status: "rejected", detail: "flow not published" }).where(eq(schema.webhookEvent.id, event.id));
        return { status: 409, body: { error: "The flow isn't published" } };
      }
      if (flow.pausedReason) {
        await tx.update(schema.webhookEvent).set({ status: "paused", detail: "flow paused: connection needs attention" }).where(eq(schema.webhookEvent.id, event.id));
        return { status: 202, body: { accepted: true, paused: true, message: "Flow is paused; the event was recorded but not run" } };
      }
      const input = {
        body,
        event_id: eventId,
        received_at: new Date().toISOString(),
        headers: { "content-type": req.headers.get("content-type"), "user-agent": req.headers.get("user-agent") },
      };
      const { run } = await enqueueRunEx(null, flow.id, { input, triggerKind: "webhook", triggerRef: eventId, actingUserId: flow.publishedBy ?? undefined }, tx);
      await tx.update(schema.webhookEvent).set({ runId: run.id }).where(eq(schema.webhookEvent.id, event.id));
      return { status: 202, body: { accepted: true, runId: run.id, runNumber: run.number } };
    });
    return reply(result.status, result.body);
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status === 429) return reply(429, { error: err.message });
    if (err.status === 409 || err.status === 422) return reply(409, { error: err.message });
    // webhook_event_signature_unique: this exact signed delivery was already accepted under another id.
    const cause = (e as { cause?: { code?: string; constraint?: string } }).cause ?? err;
    if ((cause as { code?: string }).code === "23505" && String((cause as { constraint?: string }).constraint).includes("signature")) {
      return reply(409, { error: "This signed delivery was already accepted (replay)" });
    }
    console.error("[webhook] failed", err.message);
    return reply(500, { error: "Could not accept the event; retry with the same event id" });
  }
}
