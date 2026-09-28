import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StripePaymentAdapter } from "@/billing/stripe";
import { BillingProviderError, WebhookVerificationError } from "@/billing/types";
import { startFake, type Fake } from "./helpers";

const KEY = "sk_test_fake_billing";
// The fake signs with FAKE_STRIPE_WEBHOOK_SECRET (set by .env.test) or its built-in default.
const SECRET = process.env.FAKE_STRIPE_WEBHOOK_SECRET || "whsec_fake";

interface FakeStripeState {
  customers: { id: string; metadata?: { workspaceId?: string } }[];
  checkoutSessions: { id: string; url: string; status: string; customer: string; priceId: string; trialDays: number | null }[];
  subscriptions: { id: string; customer: string; status: string; items: { data: { price: { id: string } }[] }; cancel_at_period_end: boolean }[];
  meterEvents: { event_name: string; identifier: string; payload: { value: string } }[];
  webhooks: { id: string; type: string; sent: boolean }[];
}

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});
beforeEach(async () => {
  await fake.reset();
});

const adapter = () => new StripePaymentAdapter(KEY, SECRET);
const state = () => fake.state<FakeStripeState>("stripe");

describe("key policy (test mode only)", () => {
  it.each(["sk_live_123", "rk_test_123", "pk_test_123", ""])("refuses the non-sk_test key %j", (key) => {
    expect(() => new StripePaymentAdapter(key, SECRET)).toThrow(/test-mode only/);
  });
});

describe("customers & checkout", () => {
  it("creates a customer with workspace metadata", async () => {
    const c = await adapter().createCustomer({ id: "ws-1", name: "Acme", slug: "acme" });
    expect(c.id).toMatch(/^cus_fake_/);
    const s = await state();
    expect(s.customers.find((x) => x.id === c.id)?.metadata?.workspaceId).toBe("ws-1");
  });

  it("creates a checkout session with a hosted url and completes it into a subscription", async () => {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-2", name: "Beta", slug: "beta" });
    const session = await a.createCheckoutSession({
      customerId: c.id,
      priceId: "price_test_starter",
      trialDays: 14,
      successUrl: "http://localhost:3100/w/beta/settings?billing=success",
      cancelUrl: "http://localhost:3100/w/beta/settings?billing=cancelled",
    });
    expect(session.id).toMatch(/^cs_test_/);
    expect(session.url).toBe(`${fake.url}/stripe/checkout/${session.id}`);

    // The hosted page exists and offers the two test-card actions.
    const page = await fetch(session.url);
    const html = await page.text();
    expect(html).toContain("Pay (test card)");
    expect(html).toContain("Decline (test card)");

    // Paying completes the session, creates a trialing subscription and emits both webhooks.
    const paid = await fetch(`${session.url}/complete`, { method: "POST", redirect: "manual" });
    expect(paid.status).toBe(303);
    expect(paid.headers.get("location")).toContain("billing=success");
    const s = await state();
    const sub = s.subscriptions.find((x) => x.customer === c.id);
    expect(sub).toBeDefined();
    expect(sub!.status).toBe("trialing");
    expect(sub!.items.data[0]!.price.id).toBe("price_test_starter");
    const types = s.webhooks.map((w) => w.type);
    expect(types).toContain("checkout.session.completed");
    expect(types).toContain("customer.subscription.created");
  });

  it("declining marks the session failed without a subscription", async () => {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-3", name: "Gamma", slug: "gamma" });
    const session = await a.createCheckoutSession({ customerId: c.id, priceId: "price_test_starter", successUrl: "http://x/ok", cancelUrl: "http://x/cancel" });
    const declined = await fetch(`${session.url}/fail`, { method: "POST", redirect: "manual" });
    expect(declined.status).toBe(303);
    expect(declined.headers.get("location")).toBe("http://x/cancel");
    const s = await state();
    expect(s.checkoutSessions.find((x) => x.id === session.id)?.status).toBe("failed");
    expect(s.subscriptions).toHaveLength(0);
  });
});

describe("subscription changes", () => {
  async function subscribed() {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-sub", name: "Sub Co", slug: "sub-co" });
    const session = await a.createCheckoutSession({ customerId: c.id, priceId: "price_test_starter", successUrl: "http://x/ok", cancelUrl: "http://x/cancel" });
    await fetch(`${session.url}/complete`, { method: "POST", redirect: "manual" });
    const s = await state();
    return { a, sub: s.subscriptions[0]! };
  }

  it("changes the price and cancels at period end / immediately", async () => {
    const { a, sub } = await subscribed();
    await a.changeSubscriptionPrice(sub.id, "price_test_pro");
    let s = await state();
    expect(s.subscriptions[0]!.items.data[0]!.price.id).toBe("price_test_pro");
    expect(s.webhooks.at(-1)!.type).toBe("customer.subscription.updated");

    await a.cancelSubscription(sub.id, { atPeriodEnd: true });
    s = await state();
    expect(s.subscriptions[0]!.cancel_at_period_end).toBe(true);

    await a.cancelSubscription(sub.id, { atPeriodEnd: false });
    s = await state();
    expect(s.subscriptions[0]!.status).toBe("canceled");
    expect(s.webhooks.at(-1)!.type).toBe("customer.subscription.deleted");
  });

  it("retrieves the canonical subscription state", async () => {
    const { a, sub } = await subscribed();
    const got = await a.retrieveSubscription(sub.id);
    expect(got.id).toBe(sub.id);
    expect(got.status).toBe("active");
    expect(got.priceId).toBe("price_test_starter");
    expect(got.cancelAtPeriodEnd).toBe(false);
    expect(got.currentPeriodEnd).toBeInstanceOf(Date);
    expect(got.trialEnd).toBeNull();
  });

  it("retrieveSubscription reflects provider-side changes and surfaces a missing subscription as a client error", async () => {
    const { a, sub } = await subscribed();
    await a.cancelSubscription(sub.id, { atPeriodEnd: false });
    const got = await a.retrieveSubscription(sub.id);
    expect(got.status).toBe("canceled");

    const err = await a.retrieveSubscription("sub_nope").catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).kind).toBe("client");
  });

  it("surfaces provider 5xx as an unavailable BillingProviderError", async () => {
    const { a, sub } = await subscribed();
    await fake.fault({ provider: "stripe", pathPattern: "/v1/subscriptions/", mode: "500" });
    const err = await a.changeSubscriptionPrice(sub.id, "price_test_pro").catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).kind).toBe("unavailable");
  });
});

describe("usage reporting", () => {
  it("reports meter events idempotently by identifier", async () => {
    const a = adapter();
    await a.reportUsage({ customerId: "cus_fake_x", eventName: "flowline.executions", value: 42, identifier: "usage:ws:period:executions" });
    await a.reportUsage({ customerId: "cus_fake_x", eventName: "flowline.executions", value: 42, identifier: "usage:ws:period:executions" });
    const s = await state();
    expect(s.meterEvents.filter((e) => e.identifier === "usage:ws:period:executions")).toHaveLength(1);
    expect(s.meterEvents[0]!.event_name).toBe("flowline.executions");
    expect(s.meterEvents[0]!.payload.value).toBe("42");
  });
});

describe("webhook verification", () => {
  async function emit(body: Record<string, unknown>): Promise<{ payload: string; header: string }> {
    const res = await fetch(`${fake.url}/__fake/stripe/emit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as { payload: string; header: string };
  }

  it("accepts a correctly signed event and normalizes it", async () => {
    const { payload, header } = await emit({ type: "customer.subscription.updated", customer: "cus_fake_1", subscription: { id: "sub_fake_1", price: "price_test_pro" } });
    const ev = adapter().verifyWebhook(payload, header, new Date());
    expect(ev.type).toBe("customer.subscription.updated");
    expect(ev.customerId).toBe("cus_fake_1");
    expect(ev.subscription?.id).toBe("sub_fake_1");
    expect(ev.subscription?.priceId).toBe("price_test_pro");
    expect(ev.created.getTime()).toBeGreaterThan(0);
  });

  it("rejects a tampered body or wrong signature", () => {
    return (async () => {
      const { payload, header } = await emit({ type: "invoice.paid", customer: "cus_fake_1" });
      expect(() => adapter().verifyWebhook(payload.replace("cus_fake_1", "cus_evil"), header, new Date())).toThrow(WebhookVerificationError);
      expect(() => adapter().verifyWebhook(payload, header.replace(/v1=[0-9a-f]{2}/, "v1=00"), new Date())).toThrow(WebhookVerificationError);
      expect(() => adapter().verifyWebhook(payload, null, new Date())).toThrow(WebhookVerificationError);
    })();
  });

  it("rejects signatures outside the 300s tolerance (replay)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const old = await emit({ type: "invoice.paid", customer: "cus_fake_1", signAt: nowSec - 400 });
    expect(() => adapter().verifyWebhook(old.payload, old.header, new Date())).toThrow(/tolerance/);
    const future = await emit({ type: "invoice.paid", customer: "cus_fake_1", signAt: nowSec + 400 });
    expect(() => adapter().verifyWebhook(future.payload, future.header, new Date())).toThrow(/tolerance/);
  });
});
