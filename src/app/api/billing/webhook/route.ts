import { applyWebhookEvent, webhookSignatureHeader } from "@/billing/service";
import { WebhookVerificationError } from "@/billing/types";
import { capBody, HttpError, json, route } from "@/server/http";

/**
 * Provider webhook endpoint — public (no session; authenticity comes from the
 * signature). One generic route: the provider is installation-level configuration
 * (the `billing.provider` platform setting, read per request), so the route reads the configured provider's signature
 * header (stripe-signature or paddle-signature) and the adapter does the rest.
 * Bad or stale signatures get 401; duplicate events are acknowledged without
 * re-applying; unknown customers/types are recorded and acknowledged. Processing
 * failures retain their failed-event record and return 503 so providers redeliver.
 */
export const POST = route(async (req) => {
  // Streamed cap: a chunked request without Content-Length is cut off at the limit instead of being buffered whole.
  const rawBody = await (await capBody(req, 256 * 1024, new HttpError(413, "PAYLOAD_TOO_LARGE", "Webhook payload too large"))).text();
  let result;
  try {
    result = await applyWebhookEvent(rawBody, req.headers.get(await webhookSignatureHeader()));
  } catch (e) {
    if (e instanceof WebhookVerificationError) throw new HttpError(401, "WEBHOOK_VERIFICATION_FAILED", e.message);
    throw e;
  }
  if (result.outcome === "failed") {
    return json({ received: false, ...result }, { status: 503, headers: { "retry-after": "30" } });
  }
  return json({ received: true, ...result });
});
