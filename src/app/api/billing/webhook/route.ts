import { applyWebhookEvent } from "@/billing/service";
import { WebhookVerificationError } from "@/billing/types";
import { HttpError, json, route } from "@/server/http";

/**
 * Provider webhook endpoint — public (no session; authenticity comes from the
 * signature). Bad or stale signatures get 401; duplicate events are acknowledged
 * without re-applying; unknown customers/types are recorded and acknowledged.
 */
export const POST = route(async (req) => {
  if (Number(req.headers.get("content-length") ?? 0) > 256 * 1024) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Webhook payload too large");
  const rawBody = await req.text();
  if (rawBody.length > 256 * 1024) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Webhook payload too large");
  let result;
  try {
    result = await applyWebhookEvent(rawBody, req.headers.get("stripe-signature"));
  } catch (e) {
    if (e instanceof WebhookVerificationError) throw new HttpError(401, "WEBHOOK_VERIFICATION_FAILED", e.message);
    throw e;
  }
  return json({ received: true, ...result });
});
