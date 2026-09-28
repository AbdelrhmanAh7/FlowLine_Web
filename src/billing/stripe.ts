/**
 * Stripe billing adapter — TEST MODE ONLY. The constructor refuses anything that
 * isn't an sk_test_ key, so live billing cannot be enabled by configuration.
 *
 * Speaks Stripe's REST API (form-encoded) through safeFetch (egress-guarded). In
 * the test environment FLOWLINE_PROVIDER_OVERRIDE routes it to the local fake
 * provider server under the /stripe prefix (same pattern as src/integrations/http.ts).
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

/** Stripe webhook replay tolerance, seconds. */
const WEBHOOK_TOLERANCE_SEC = 300;

/** Base URL: the fake provider server in tests, the real API otherwise. */
function defaultBase(): string {
  if (process.env.FLOWLINE_ENV === "test" && process.env.FLOWLINE_PROVIDER_OVERRIDE) {
    return `${process.env.FLOWLINE_PROVIDER_OVERRIDE.replace(/\/$/, "")}/stripe`;
  }
  return "https://api.stripe.com";
}

export class StripePaymentAdapter implements PaymentAdapter {
  readonly provider = "stripe";
  private readonly baseUrl?: string;

  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret?: string,
    opts: { baseUrl?: string } = {},
  ) {
    if (!apiKey.startsWith("sk_test_")) {
      throw new Error('Billing is test-mode only: the Stripe key must start with "sk_test_" (live keys like "sk_live_" are refused)');
    }
    this.baseUrl = opts.baseUrl;
  }

  private base() {
    return this.baseUrl ?? defaultBase();
  }

  private async request<T>(method: string, path: string, opts: { form?: Record<string, string>; json?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}`, accept: "application/json" };
    let body: string | undefined;
    if (opts.form) {
      body = new URLSearchParams(opts.form).toString();
      headers["content-type"] = "application/x-www-form-urlencoded";
    } else if (opts.json !== undefined) {
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
    if (res.status >= 200 && res.status < 300) return data as T;
    const msg = stripeErrorMessage(data) ?? `HTTP ${res.status}`;
    if (res.status >= 500) throw new BillingProviderError("unavailable", `Billing provider error ${res.status}: ${msg}`);
    throw new BillingProviderError("client", `Billing provider refused the request: ${msg}`);
  }

  async createCustomer(workspace: WorkspaceRef): Promise<{ id: string }> {
    const res = await this.request<{ id: string }>("POST", "/v1/customers", {
      form: { name: workspace.name, "metadata[workspaceId]": workspace.id, "metadata[workspaceSlug]": workspace.slug },
    });
    return { id: res.id };
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }> {
    const form: Record<string, string> = {
      mode: "subscription",
      customer: input.customerId,
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    };
    if (input.trialDays) form["subscription_data[trial_period_days]"] = String(input.trialDays);
    const res = await this.request<{ id: string; url: string }>("POST", "/v1/checkout/sessions", { form });
    if (!res.url) throw new BillingProviderError("unavailable", "Billing provider returned a checkout session without a URL");
    return { id: res.id, url: res.url };
  }

  async changeSubscriptionPrice(subscriptionId: string, priceId: string): Promise<void> {
    await this.request("POST", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { form: { "items[0][price]": priceId } });
  }

  async cancelSubscription(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void> {
    const path = `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
    if (opts.atPeriodEnd) await this.request("POST", path, { form: { cancel_at_period_end: "true" } });
    else await this.request("DELETE", path);
  }

  async retrieveSubscription(subscriptionId: string): Promise<NormalizedSubscription> {
    const res = await this.request<unknown>("GET", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const sub = normalizeSubscription(res);
    if (!sub) throw new BillingProviderError("unavailable", "Billing provider returned an unrecognized subscription");
    return sub;
  }

  async reportUsage(input: UsageReportInput): Promise<void> {
    await this.request("POST", "/v1/billing/meter_events", {
      json: {
        event_name: input.eventName,
        identifier: input.identifier,
        payload: { value: String(input.value), stripe_customer_id: input.customerId },
      },
    });
  }

  /**
   * Stripe webhook scheme: `Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
   * Rejects bad signatures and timestamps outside ±300s (replay protection).
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null, now: Date): BillingWebhookEvent {
    if (!this.webhookSecret) throw new WebhookVerificationError("Webhook secret is not configured");
    if (!signatureHeader) throw new WebhookVerificationError("Missing Stripe-Signature header");
    let timestamp: string | null = null;
    const signatures: string[] = [];
    for (const part of signatureHeader.split(",")) {
      const [k, v] = part.split("=", 2);
      if (k === "t") timestamp = v ?? null;
      else if (k === "v1" && v) signatures.push(v);
    }
    if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) throw new WebhookVerificationError("Malformed Stripe-Signature header");
    const ageSec = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
    if (ageSec > WEBHOOK_TOLERANCE_SEC) throw new WebhookVerificationError("Webhook timestamp outside the tolerance window (possible replay)");
    const expected = createHmac("sha256", this.webhookSecret).update(`${timestamp}.${rawBody}`, "utf8").digest();
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
    return normalizeStripeEvent(payload);
  }
}

function stripeErrorMessage(data: unknown): string | undefined {
  const e = (data as { error?: unknown } | null)?.error;
  const msg = typeof e === "string" ? e : ((e as { message?: unknown } | undefined)?.message as string | undefined);
  return typeof msg === "string" ? msg.slice(0, 300) : undefined;
}

function unixToDate(v: unknown): Date | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

function normalizeSubscription(raw: unknown): NormalizedSubscription | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string") return undefined;
  const items = (s.items as { data?: { price?: { id?: string } }[] } | undefined)?.data;
  return {
    id: s.id,
    status: typeof s.status === "string" ? s.status : "incomplete",
    priceId: items?.[0]?.price?.id ?? null,
    currentPeriodEnd: unixToDate(s.current_period_end),
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
    trialEnd: unixToDate(s.trial_end),
  };
}

/** Maps a Stripe event payload onto the normalized shape; unknown types pass through with just id/type/created/customer. */
export function normalizeStripeEvent(payload: Record<string, unknown>): BillingWebhookEvent {
  const obj = (payload.data as { object?: unknown } | undefined)?.object as Record<string, unknown> | undefined;
  const event: BillingWebhookEvent = {
    id: String(payload.id ?? ""),
    provider: "stripe",
    type: String(payload.type ?? ""),
    created: unixToDate(payload.created) ?? new Date(0),
    customerId: (obj?.customer as string) ?? null,
  };
  if (event.type.startsWith("customer.subscription.")) {
    event.subscription = normalizeSubscription(obj);
  } else if (event.type === "checkout.session.completed" && obj) {
    event.checkoutSession = { id: String(obj.id ?? ""), subscriptionId: (obj.subscription as string) ?? null };
  }
  return event;
}
