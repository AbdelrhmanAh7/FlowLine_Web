/**
 * Paddle billing adapter — SANDBOX ONLY in this phase. The constructor refuses
 * live keys (pdl_live_…) unless explicitly built with { env: "live", allowLive: true }
 * (FLOWLINE_BILLING_ALLOW_LIVE, which nobody sets now).
 *
 * Speaks the Paddle Billing API v1 (JSON, `{data, meta}` envelopes) through
 * safeFetch (egress-guarded). In the test environment FLOWLINE_PROVIDER_OVERRIDE
 * routes it to the local fake provider server under the /paddle prefix.
 *
 * Verified against developer.paddle.com (2026-09) and the official paddle-node-sdk:
 * - Auth: `Authorization: Bearer <key>`; sandbox keys are pdl_sdbx_…, live pdl_live_…
 * - Webhooks: `Paddle-Signature: ts=<unix>;h1=<hex HMAC-SHA256(secret, "ts:rawBody")>`
 * - Event envelope: { event_id, event_type, occurred_at, data }
 * - Sandbox auto-approves domains for hosted checkout, so a transaction's
 *   `checkout.url` (Paddle-hosted page) works without website approval; the
 *   Paddle.js overlay would also work but needs a client-side token in the bundle.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { EgressError, safeFetch } from "@/server/egress";
import {
  BillingProviderError,
  WebhookVerificationError,
  type BillingWebhookEvent,
  type CheckoutSessionInput,
  type NormalizedSubscription,
  type PaymentAdapter,
  type UsageReportInput,
  type WorkspaceRef,
} from "./types";

/**
 * Webhook replay tolerance, seconds. Paddle leaves the tolerance to the implementer
 * (its SDKs default to 5s); we use 300s to match the Stripe adapter and to tolerate
 * retries and clock skew. Replays inside the window are deduped by event id.
 */
const WEBHOOK_TOLERANCE_SEC = 300;

const BASES = { sandbox: "https://sandbox-api.paddle.com", live: "https://api.paddle.com" } as const;

/** Base URL: the fake provider server in tests, the real API otherwise. */
function defaultBase(env: "sandbox" | "live"): string {
  if (process.env.FLOWLINE_ENV === "test" && process.env.FLOWLINE_PROVIDER_OVERRIDE) {
    return `${process.env.FLOWLINE_PROVIDER_OVERRIDE.replace(/\/$/, "")}/paddle`;
  }
  return BASES[env];
}

export class PaddlePaymentAdapter implements PaymentAdapter {
  readonly provider = "paddle";
  readonly mode: "sandbox" | "live";
  readonly webhookSignatureHeader = "paddle-signature";
  /** Paddle Billing has no usage-metering API (no equivalent of Stripe meters). */
  readonly supportsUsageReporting = false;
  private readonly env: "sandbox" | "live";
  private readonly baseUrl?: string;

  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret?: string,
    opts: { env?: "sandbox" | "live"; baseUrl?: string; allowLive?: boolean } = {},
  ) {
    this.env = opts.env ?? "sandbox";
    if (apiKey.startsWith("pdl_live_")) {
      if (!(this.env === "live" && opts.allowLive)) {
        throw new Error('Billing is sandbox-only: a live Paddle key ("pdl_live_…") requires FLOWLINE_BILLING_ALLOW_LIVE=true and FLOWLINE_BILLING_PADDLE_ENV=live');
      }
    } else if (apiKey.startsWith("pdl_sdbx_")) {
      if (this.env !== "sandbox") throw new Error('A sandbox Paddle key ("pdl_sdbx_…") requires FLOWLINE_BILLING_PADDLE_ENV=sandbox');
    } else {
      throw new Error('The Paddle key must be a Paddle API key ("pdl_sdbx_…" for sandbox)');
    }
    this.mode = this.env === "live" ? "live" : "sandbox";
    this.baseUrl = opts.baseUrl;
  }

  private base() {
    return this.baseUrl ?? defaultBase(this.env);
  }

  private async request<T>(method: string, path: string, opts: { json?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}`, accept: "application/json" };
    let body: string | undefined;
    if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers["content-type"] = "application/json";
    }
    let res;
    try {
      res = await safeFetch(this.base() + path, { method, headers, body, timeoutMs: 10_000 });
    } catch (e) {
      if (e instanceof BillingProviderError) throw e;
      if (e instanceof EgressError) throw new BillingProviderError("unavailable", `Billing provider request blocked: ${e.message}`);
      const name = (e as Error).name;
      if (name === "TimeoutError" || name === "AbortError") throw new BillingProviderError("unavailable", "Billing provider did not respond in time");
      throw new BillingProviderError("unavailable", `Could not reach the billing provider (${(e as { cause?: { code?: string } }).cause?.code ?? name})`);
    }
    let data: unknown = null;
    const text = res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (res.status >= 200 && res.status < 300) return (data as { data?: T } | null)?.data as T;
    const msg = paddleErrorMessage(data) ?? `HTTP ${res.status}`;
    if (res.status >= 500) throw new BillingProviderError("unavailable", `Billing provider error ${res.status}: ${msg}`);
    throw new BillingProviderError("client", `Billing provider refused the request: ${msg}`);
  }

  async createCustomer(workspace: WorkspaceRef): Promise<{ id: string }> {
    // Paddle requires an email to create a customer (verified in the API reference).
    if (!workspace.email) throw new BillingProviderError("client", "Paddle requires an email address to create a customer");
    const res = await this.request<{ id: string }>("POST", "/customers", {
      json: { email: workspace.email, name: workspace.name, custom_data: { workspaceId: workspace.id, workspaceSlug: workspace.slug } },
    });
    return { id: res.id };
  }

  /**
   * Checkout = a Paddle transaction for the price + customer; the response carries a
   * Paddle-hosted `checkout.url`. Chosen over the Paddle.js overlay because the hosted
   * page needs no client-side token and domains are auto-approved in sandbox, while an
   * overlay/inline checkout on our own page would need website approval for live.
   * Paddle has no cancel-redirect parameter on transactions: `cancelUrl` is unused
   * (the hosted page simply stays open). Trials come from the price's trial_period in
   * the Paddle catalog, so `trialDays` is plan metadata only here.
   */
  async createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }> {
    const res = await this.request<{ id: string; checkout?: { url?: string | null } | null }>("POST", "/transactions", {
      json: {
        items: [{ price_id: input.priceId, quantity: 1 }],
        customer_id: input.customerId,
        checkout: { url: input.successUrl },
      },
    });
    const url = res.checkout?.url;
    if (!url) throw new BillingProviderError("unavailable", "Billing provider returned a transaction without a checkout URL");
    return { id: res.id, url };
  }

  /** Plan change with proration: prorated_immediately bills/credits the difference at once. */
  async changeSubscriptionPrice(subscriptionId: string, priceId: string): Promise<void> {
    await this.request("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      json: { items: [{ price_id: priceId, quantity: 1 }], proration_billing_mode: "prorated_immediately" },
    });
  }

  async cancelSubscription(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void> {
    await this.request("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      json: { effective_from: opts.atPeriodEnd ? "next_billing_period" : "immediately" },
    });
  }

  async retrieveSubscription(subscriptionId: string): Promise<NormalizedSubscription> {
    const res = await this.request<unknown>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const sub = normalizePaddleSubscription(res);
    if (!sub) throw new BillingProviderError("unavailable", "Billing provider returned an unrecognized subscription");
    return sub;
  }

  /**
   * Paddle has no metered-usage API, so there is nothing to report to. The service
   * checks `supportsUsageReporting` and never calls this; calling it directly is an error.
   */
  async reportUsage(_input: UsageReportInput): Promise<void> {
    throw new BillingProviderError("client", "Paddle Billing has no usage-metering API; usage is recorded in the local ledger only");
  }

  /**
   * Paddle webhook scheme: `Paddle-Signature: ts=<unix>;h1=<hex HMAC-SHA256(secret, "ts:rawBody")>`.
   * More than one h1 may be present during secret rotation; any match accepts.
   * Rejects bad signatures and timestamps outside the tolerance window (replay protection).
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null, now: Date): BillingWebhookEvent {
    if (!this.webhookSecret) throw new WebhookVerificationError("Webhook secret is not configured");
    if (!signatureHeader) throw new WebhookVerificationError("Missing Paddle-Signature header");
    let timestamp: string | null = null;
    const signatures: string[] = [];
    for (const part of signatureHeader.split(";")) {
      const [k, v] = part.split("=", 2);
      if (k === "ts") timestamp = v ?? null;
      else if (k === "h1" && v) signatures.push(v);
    }
    if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) throw new WebhookVerificationError("Malformed Paddle-Signature header");
    const ageSec = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
    if (ageSec > WEBHOOK_TOLERANCE_SEC) throw new WebhookVerificationError("Webhook timestamp outside the tolerance window (possible replay)");
    const expected = createHmac("sha256", this.webhookSecret).update(`${timestamp}:${rawBody}`, "utf8").digest();
    const ok = signatures.some((sig) => {
      let buf: Buffer;
      try {
        buf = Buffer.from(sig, "hex");
      } catch {
        return false;
      }
      return buf.length === expected.length && timingSafeEqual(buf, expected);
    });
    if (!ok) throw new WebhookVerificationError("Webhook signature mismatch");

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new WebhookVerificationError("Webhook body is not valid JSON");
    }
    return normalizePaddleEvent(payload);
  }
}

function paddleErrorMessage(data: unknown): string | undefined {
  const e = (data as { error?: unknown } | null)?.error as { detail?: unknown; code?: unknown } | undefined;
  const msg = typeof e?.detail === "string" ? e.detail : typeof e?.code === "string" ? e.code : undefined;
  return msg?.slice(0, 300);
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Paddle subscription → normalized snapshot. `scheduled_change.action === "cancel"` is
 * Paddle's cancel-at-period-end. There is no top-level trial end: a trialing
 * subscription's trial ends when its item's trial_dates (or current period) ends.
 */
export function normalizePaddleSubscription(raw: unknown): NormalizedSubscription | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string") return undefined;
  const items = s.items as { price?: { id?: string }; trial_dates?: { ends_at?: string } | null }[] | undefined;
  const period = s.current_billing_period as { ends_at?: string } | null | undefined;
  const scheduled = s.scheduled_change as { action?: string } | null | undefined;
  const status = typeof s.status === "string" ? s.status : "active";
  const trialEnd = parseDate(items?.[0]?.trial_dates?.ends_at) ?? (status === "trialing" ? parseDate(period?.ends_at) : null);
  return {
    id: s.id,
    status,
    priceId: items?.[0]?.price?.id ?? null,
    currentPeriodEnd: parseDate(period?.ends_at),
    cancelAtPeriodEnd: scheduled?.action === "cancel",
    trialEnd,
  };
}

/** Maps a Paddle event type onto the provider-neutral action the service switches on. */
function paddleAction(type: string, data: Record<string, unknown> | undefined): BillingWebhookEvent["action"] {
  if (type === "transaction.completed") {
    // Renewals complete a transaction too; origin tells the initial checkout apart
    // from a recurring charge (a payment success), like Stripe's invoice.paid.
    return data?.origin === "subscription_recurring" ? "payment_succeeded" : "checkout_completed";
  }
  if (type.startsWith("subscription.")) {
    if (type === "subscription.canceled") return "subscription_deleted";
    if (type === "subscription.past_due") return "payment_failed";
    return "subscription_upsert"; // created, updated, activated, trialing, paused, resumed
  }
  if (type.startsWith("adjustment.")) return "refund"; // created, updated
  return "other";
}

/** Maps a Paddle notification payload onto the normalized shape. */
export function normalizePaddleEvent(payload: Record<string, unknown>): BillingWebhookEvent {
  const data = payload.data as Record<string, unknown> | undefined;
  const type = String(payload.event_type ?? "");
  const event: BillingWebhookEvent = {
    id: String(payload.event_id ?? ""),
    provider: "paddle",
    type,
    action: paddleAction(type, data),
    created: parseDate(payload.occurred_at) ?? new Date(0),
    customerId: (data?.customer_id as string) ?? null,
  };
  if (type.startsWith("subscription.")) {
    event.subscription = normalizePaddleSubscription(data);
  } else if (event.action === "checkout_completed" && data) {
    event.checkoutSession = { id: String(data.id ?? ""), subscriptionId: (data.subscription_id as string) ?? null };
  } else if (event.action === "refund" && data) {
    event.refund = {
      id: String(data.id ?? ""),
      transactionId: (data.transaction_id as string) ?? null,
      subscriptionId: (data.subscription_id as string) ?? null,
      status: (data.status as string) ?? null,
    };
  }
  return event;
}
