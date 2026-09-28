import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PaddlePaymentAdapter } from "@/billing/paddle";
import { BillingProviderError, WebhookVerificationError } from "@/billing/types";
import { startFake, type Fake } from "./helpers";

const KEY = "pdl_sdbx_fake_billing";
// The fake signs with FAKE_PADDLE_WEBHOOK_SECRET (set by the test file/env) or its built-in default.
const SECRET = process.env.FAKE_PADDLE_WEBHOOK_SECRET || "pdl_ntfset_fake";

interface FakePaddleState {
  prices: { id: string; trialDays: number }[];
  customers: { id: string; email: string; name: string | null; custom_data: { workspaceId?: string } }[];
  transactions: { id: string; status: string; customer_id: string; subscription_id: string | null; checkout: { url: string | null } }[];
  subscriptions: {
    id: string;
    customer_id: string;
    status: string;
    items: { price: { id: string }; trial_dates: { ends_at: string } | null }[];
    current_billing_period: { ends_at: string } | null;
    scheduled_change: { action: string } | null;
  }[];
  adjustments: { id: string; action: string; status: string; transaction_id: string; customer_id: string; subscription_id: string | null }[];
  webhooks: { id: string; type: string; sent: boolean; payload: string; header: string }[];
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
  // Trials live on the price in Paddle's catalog, so tests register the prices they sell.
  await registerPrice("pri_test_starter", 14);
  await registerPrice("pri_test_pro", 0);
});

async function registerPrice(id: string, trialDays: number) {
  await fetch(`${fake.url}/__fake/paddle/price`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, trialDays }) });
}

const adapter = () => new PaddlePaymentAdapter(KEY, SECRET);
const state = () => fake.state<FakePaddleState>("paddle");

describe("key policy (sandbox only)", () => {
  it("refuses a live key without the explicit live opt-in", () => {
    expect(() => new PaddlePaymentAdapter("pdl_live_apikey_01gtgztp8f4kek3yd4g1wrksa3_x", SECRET)).toThrow(/sandbox-only/);
    expect(() => new PaddlePaymentAdapter("pdl_live_apikey_01gtgztp8f4kek3yd4g1wrksa3_x", SECRET, { env: "live" })).toThrow(/sandbox-only/);
    expect(() => new PaddlePaymentAdapter("pdl_live_apikey_01gtgztp8f4kek3yd4g1wrksa3_x", SECRET, { allowLive: true })).toThrow(/sandbox-only/);
  });

  it("refuses keys that aren't Paddle API keys", () => {
    expect(() => new PaddlePaymentAdapter("sk_test_123", SECRET)).toThrow(/Paddle API key/);
    expect(() => new PaddlePaymentAdapter("", SECRET)).toThrow(/Paddle API key/);
  });

  it("refuses a sandbox key pointed at the live environment", () => {
    expect(() => new PaddlePaymentAdapter(KEY, SECRET, { env: "live" })).toThrow(/sandbox/);
  });

  it("reports its mode; live is reachable only behind the explicit opt-in", () => {
    expect(adapter().mode).toBe("sandbox");
    expect(adapter().supportsUsageReporting).toBe(false);
    const live = new PaddlePaymentAdapter("pdl_live_apikey_01gtgztp8f4kek3yd4g1wrksa3_x", SECRET, { env: "live", allowLive: true });
    expect(live.mode).toBe("live");
  });
});

describe("customers & checkout", () => {
  it("creates a customer with email and workspace custom data", async () => {
    const c = await adapter().createCustomer({ id: "ws-1", name: "Acme", slug: "acme", email: "owner@acme.test" });
    expect(c.id).toMatch(/^ctm_fake_/);
    const s = await state();
    const stored = s.customers.find((x) => x.id === c.id);
    expect(stored?.email).toBe("owner@acme.test");
    expect(stored?.custom_data.workspaceId).toBe("ws-1");
  });

  it("refuses to create a customer without an email (Paddle requires one)", async () => {
    const err = await adapter()
      .createCustomer({ id: "ws-noemail", name: "NoMail", slug: "nomail" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).kind).toBe("client");
    expect((await state()).customers).toHaveLength(0);
  });

  it("creates a transaction with a hosted checkout url and completes it into a trialing subscription", async () => {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-2", name: "Beta", slug: "beta", email: "owner@beta.test" });
    const session = await a.createCheckoutSession({
      customerId: c.id,
      priceId: "pri_test_starter",
      trialDays: 14,
      successUrl: "http://localhost:3100/w/beta/settings?billing=success",
      cancelUrl: "http://localhost:3100/w/beta/settings?billing=cancelled",
    });
    expect(session.id).toMatch(/^txn_fake_/);
    expect(session.url).toBe(`${fake.url}/paddle/checkout/${session.id}`);

    // The hosted page exists and offers the two test-card actions.
    const page = await fetch(session.url);
    const html = await page.text();
    expect(html).toContain("Pay (test card)");
    expect(html).toContain("Decline (test card)");

    // Paying completes the transaction, creates a trialing subscription (14-day price trial) and emits both webhooks.
    const paid = await fetch(`${session.url}/complete`, { method: "POST", redirect: "manual" });
    expect(paid.status).toBe(303);
    expect(paid.headers.get("location")).toContain("billing=success");
    const s = await state();
    const sub = s.subscriptions.find((x) => x.customer_id === c.id);
    expect(sub).toBeDefined();
    expect(sub!.status).toBe("trialing");
    expect(sub!.items[0]!.price.id).toBe("pri_test_starter");
    expect(s.transactions.find((x) => x.id === session.id)?.subscription_id).toBe(sub!.id);
    const types = s.webhooks.map((w) => w.type);
    expect(types).toContain("transaction.completed");
    expect(types).toContain("subscription.created");
  });

  it("an unknown price id is a client error, not a crash", async () => {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-2b", name: "Beta2", slug: "beta2", email: "o@b2.test" });
    const err = await a.createCheckoutSession({ customerId: c.id, priceId: "pri_nope", successUrl: "http://x/ok", cancelUrl: "http://x/cancel" }).catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).kind).toBe("client");
  });

  it("declining keeps the buyer on the page, moves the transaction to past_due and emits transaction.payment_failed", async () => {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-3", name: "Gamma", slug: "gamma", email: "owner@gamma.test" });
    const session = await a.createCheckoutSession({ customerId: c.id, priceId: "pri_test_starter", successUrl: "http://x/ok", cancelUrl: "http://x/cancel" });
    const declined = await fetch(`${session.url}/fail`, { method: "POST", redirect: "manual" });
    expect(declined.status).toBe(303);
    expect(declined.headers.get("location")).toBe(`/paddle/checkout/${session.id}`);
    const s = await state();
    expect(s.transactions.find((x) => x.id === session.id)?.status).toBe("past_due");
    expect(s.subscriptions).toHaveLength(0);
    expect(s.webhooks.at(-1)!.type).toBe("transaction.payment_failed");
  });
});

describe("subscription changes", () => {
  async function subscribed() {
    const a = adapter();
    const c = await a.createCustomer({ id: "ws-sub", name: "Sub Co", slug: "sub-co", email: "owner@sub.test" });
    const session = await a.createCheckoutSession({ customerId: c.id, priceId: "pri_test_starter", successUrl: "http://x/ok", cancelUrl: "http://x/cancel" });
    await fetch(`${session.url}/complete`, { method: "POST", redirect: "manual" });
    const s = await state();
    return { a, customer: c, txn: s.transactions[0]!, sub: s.subscriptions[0]! };
  }

  it("changes the price with proration and cancels at period end / immediately", async () => {
    const { a, sub } = await subscribed();
    await a.changeSubscriptionPrice(sub.id, "pri_test_pro");
    let s = await state();
    expect(s.subscriptions[0]!.items[0]!.price.id).toBe("pri_test_pro");
    expect(s.webhooks.at(-1)!.type).toBe("subscription.updated");
    // The proration mode the adapter picked is visible in the recorded request.
    const patch = (await fake.requests("paddle")).find((r) => r.method === "PATCH" && r.path.includes(`/subscriptions/${sub.id}`));
    expect((patch!.body as { proration_billing_mode?: string }).proration_billing_mode).toBe("prorated_immediately");

    await a.cancelSubscription(sub.id, { atPeriodEnd: true });
    s = await state();
    expect(s.subscriptions[0]!.scheduled_change?.action).toBe("cancel");
    expect(s.subscriptions[0]!.status).not.toBe("canceled");

    await a.cancelSubscription(sub.id, { atPeriodEnd: false });
    s = await state();
    expect(s.subscriptions[0]!.status).toBe("canceled");
    expect(s.webhooks.at(-1)!.type).toBe("subscription.canceled");
  });

  it("retrieves the canonical subscription state", async () => {
    const { a, sub } = await subscribed();
    const got = await a.retrieveSubscription(sub.id);
    expect(got.id).toBe(sub.id);
    expect(got.status).toBe("trialing");
    expect(got.priceId).toBe("pri_test_starter");
    expect(got.cancelAtPeriodEnd).toBe(false);
    expect(got.currentPeriodEnd).toBeInstanceOf(Date);
    expect(got.trialEnd).toBeInstanceOf(Date);
  });

  it("retrieveSubscription reflects provider-side changes and surfaces a missing subscription as a client error", async () => {
    const { a, sub } = await subscribed();
    await a.cancelSubscription(sub.id, { atPeriodEnd: true });
    let got = await a.retrieveSubscription(sub.id);
    expect(got.cancelAtPeriodEnd).toBe(true);

    await a.cancelSubscription(sub.id, { atPeriodEnd: false });
    got = await a.retrieveSubscription(sub.id);
    expect(got.status).toBe("canceled");
    expect(got.currentPeriodEnd).toBeNull();

    const err = await a.retrieveSubscription("sub_nope").catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).kind).toBe("client");
  });

  it("surfaces provider 5xx as an unavailable BillingProviderError", async () => {
    const { a, sub } = await subscribed();
    await fake.fault({ provider: "paddle", pathPattern: "/subscriptions/", mode: "500" });
    const err = await a.changeSubscriptionPrice(sub.id, "pri_test_pro").catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).kind).toBe("unavailable");
  });

  it("creates a refund adjustment for a transaction (sandbox auto-approves)", async () => {
    const { txn } = await subscribed();
    const res = await fetch(`${fake.url}/paddle/adjustments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ action: "refund", transaction_id: txn.id, items: [{ item_id: "txni_1", type: "full" }], reason: "test refund" }),
    });
    expect(res.status).toBe(201);
    const s = await state();
    const adj = s.adjustments[0]!;
    expect(adj.action).toBe("refund");
    expect(adj.status).toBe("approved");
    expect(adj.customer_id).toBe(txn.customer_id);
    expect(adj.subscription_id).toBe(txn.subscription_id);
    expect(s.webhooks.at(-1)!.type).toBe("adjustment.created");
  });
});

describe("usage reporting", () => {
  it("is unsupported: Paddle has no metered-billing API and reportUsage says so", async () => {
    const err = await adapter()
      .reportUsage({ customerId: "ctm_fake_x", eventName: "flowline.executions", value: 42, identifier: "usage:ws:period:executions" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).message).toContain("no usage-metering API");
  });
});

describe("webhook verification", () => {
  async function emit(body: Record<string, unknown>): Promise<{ id: string; payload: string; header: string }> {
    const res = await fetch(`${fake.url}/__fake/paddle/emit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as { id: string; payload: string; header: string };
  }

  it("accepts a correctly signed event and normalizes it (subscription.updated)", async () => {
    const occurredAt = "2026-09-28T10:00:00.123Z";
    const { payload, header } = await emit({ type: "subscription.updated", customer: "ctm_fake_1", subscription: { id: "sub_fake_1", price: "pri_test_pro" }, occurredAt });
    const ev = adapter().verifyWebhook(payload, header, new Date());
    expect(ev.provider).toBe("paddle");
    expect(ev.type).toBe("subscription.updated");
    expect(ev.action).toBe("subscription_upsert");
    expect(ev.customerId).toBe("ctm_fake_1");
    expect(ev.subscription?.id).toBe("sub_fake_1");
    expect(ev.subscription?.priceId).toBe("pri_test_pro");
    // occurred_at (millisecond resolution) is the ordering timestamp.
    expect(ev.created.toISOString()).toBe(occurredAt);
  });

  it("maps lifecycle events onto actions: canceled, past_due, checkout, renewal, refund", async () => {
    const a = adapter();

    const canceled = await emit({ type: "subscription.canceled", customer: "ctm_fake_1", subscription: { id: "sub_fake_1" } });
    expect(a.verifyWebhook(canceled.payload, canceled.header, new Date()).action).toBe("subscription_deleted");

    const pastDue = await emit({ type: "subscription.past_due", customer: "ctm_fake_1", subscription: { id: "sub_fake_1" } });
    expect(a.verifyWebhook(pastDue.payload, pastDue.header, new Date()).action).toBe("payment_failed");

    const paused = await emit({ type: "subscription.paused", customer: "ctm_fake_1", subscription: { id: "sub_fake_1", status: "paused", current_billing_period: null } });
    const pausedEv = a.verifyWebhook(paused.payload, paused.header, new Date());
    expect(pausedEv.action).toBe("subscription_upsert");
    expect(pausedEv.subscription?.status).toBe("paused");

    const checkout = await emit({ type: "transaction.completed", customer: "ctm_fake_1", transaction: { id: "txn_fake_9", subscription_id: "sub_fake_1", origin: "web" } });
    const checkoutEv = a.verifyWebhook(checkout.payload, checkout.header, new Date());
    expect(checkoutEv.action).toBe("checkout_completed");
    expect(checkoutEv.checkoutSession).toEqual({ id: "txn_fake_9", subscriptionId: "sub_fake_1" });

    const renewal = await emit({ type: "transaction.completed", customer: "ctm_fake_1", transaction: { id: "txn_fake_10", subscription_id: "sub_fake_1", origin: "subscription_recurring" } });
    expect(a.verifyWebhook(renewal.payload, renewal.header, new Date()).action).toBe("payment_succeeded");

    const refund = await emit({ type: "adjustment.created", customer: "ctm_fake_1", adjustment: { id: "adj_fake_1", transaction_id: "txn_fake_9", subscription_id: "sub_fake_1", status: "approved" } });
    const refundEv = a.verifyWebhook(refund.payload, refund.header, new Date());
    expect(refundEv.action).toBe("refund");
    expect(refundEv.refund).toEqual({ id: "adj_fake_1", transactionId: "txn_fake_9", subscriptionId: "sub_fake_1", status: "approved" });
  });

  it("derives cancel-at-period-end from scheduled_change and trial end from trial_dates", async () => {
    const { payload, header } = await emit({
      type: "subscription.updated",
      customer: "ctm_fake_1",
      subscription: {
        id: "sub_fake_2",
        price: "pri_test_starter",
        status: "trialing",
        scheduled_change: { action: "cancel", effective_at: "2026-10-28T10:00:00Z", resume_at: null },
        items: [{ status: "trialing", quantity: 1, recurring: true, price: { id: "pri_test_starter" }, trial_dates: { starts_at: "2026-09-28T10:00:00Z", ends_at: "2026-10-12T10:00:00Z" } }],
      },
      mutate: false,
    });
    const ev = adapter().verifyWebhook(payload, header, new Date());
    expect(ev.subscription?.cancelAtPeriodEnd).toBe(true);
    expect(ev.subscription?.trialEnd?.toISOString()).toBe("2026-10-12T10:00:00.000Z");
  });

  it("rejects a tampered body or wrong signature", async () => {
    const { payload, header } = await emit({ type: "subscription.updated", customer: "ctm_fake_1", subscription: { id: "sub_fake_1" } });
    expect(() => adapter().verifyWebhook(payload.replace("ctm_fake_1", "ctm_evil"), header, new Date())).toThrow(WebhookVerificationError);
    expect(() => adapter().verifyWebhook(payload, header.replace(/h1=[0-9a-f]{2}/, "h1=00"), new Date())).toThrow(WebhookVerificationError);
    expect(() => adapter().verifyWebhook(payload, null, new Date())).toThrow(WebhookVerificationError);
    expect(() => adapter().verifyWebhook(payload, "ts=notanumber;h1=abcd", new Date())).toThrow(WebhookVerificationError);
  });

  it("rejects signatures outside the tolerance window (replay)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const old = await emit({ type: "subscription.updated", customer: "ctm_fake_1", subscription: { id: "sub_fake_1" }, signAt: nowSec - 400 });
    expect(() => adapter().verifyWebhook(old.payload, old.header, new Date())).toThrow(/tolerance/);
    const future = await emit({ type: "subscription.updated", customer: "ctm_fake_1", subscription: { id: "sub_fake_1" }, signAt: nowSec + 400 });
    expect(() => adapter().verifyWebhook(future.payload, future.header, new Date())).toThrow(/tolerance/);
  });
});
