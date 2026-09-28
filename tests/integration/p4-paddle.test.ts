/**
 * Phase 4 — Paddle billing behind the existing billing abstraction.
 *
 * Mirrors p3-billing.test.ts (Stripe) against the Paddle adapter + fake Paddle.
 * The provider is installation-level env; this file sets it for its own run and
 * restores it afterwards so sibling files in the same worker are unaffected.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { POST as webhookRoute } from "@/app/api/billing/webhook/route";
import { applyWebhookEvent, cancel, changePlan, getBillingState, getEntitlements, reconcileUsage, startCheckout } from "@/billing/service";
import { requireWorkspace } from "@/server/access";
import { monthStart } from "@/server/usage";
import { createWorkspace } from "@/server/workspaces";
import { startFake, type Fake } from "../contract/helpers";
import { addMember, closeDb, expectHttpError, makeUser, unique } from "./helpers";

const PADDLE_SECRET = "pdl_ntfset_fake_integration";

const PADDLE_PLANS = [
  {
    id: "test_free",
    name: "Test Free",
    providerPriceId: "pri_test_free",
    displayPrice: { amountMinor: 0, currency: "USD", interval: "month" },
    entitlements: { maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 },
  },
  {
    id: "test_starter",
    name: "Test Starter",
    providerPriceId: "pri_test_starter",
    displayPrice: { amountMinor: 1500, currency: "USD", interval: "month" },
    trialDays: 14,
    entitlements: { maxMonthlyExecutions: 5000, monthlyUsageCapMicros: 50000000, maxConcurrentRuns: 4 },
  },
  {
    id: "test_pro",
    name: "Test Pro",
    providerPriceId: "pri_test_pro",
    displayPrice: { amountMinor: 4900, currency: "USD", interval: "month" },
    entitlements: { maxMonthlyExecutions: null, monthlyUsageCapMicros: null, maxConcurrentRuns: 10 },
  },
];

const ENV_OVERRIDE: Record<string, string> = {
  FLOWLINE_BILLING_PROVIDER: "paddle",
  FLOWLINE_BILLING_PADDLE_KEY: "pdl_sdbx_fake_billing",
  FLOWLINE_BILLING_PADDLE_WEBHOOK_SECRET: PADDLE_SECRET,
  FLOWLINE_BILLING_PADDLE_ENV: "sandbox",
  FAKE_PADDLE_WEBHOOK_SECRET: PADDLE_SECRET,
  FLOWLINE_BILLING_PLANS: JSON.stringify(PADDLE_PLANS),
  FLOWLINE_BILLING_FREE_PLAN: "test_free",
};

interface FakeSub {
  id: string;
  customer_id: string;
  status: string;
  items: { price: { id: string }; trial_dates: { ends_at: string } | null }[];
  scheduled_change: { action: string } | null;
}
interface FakeWebhook {
  id: string;
  type: string;
  payload: string;
  header: string;
}
interface FakePaddleState {
  subscriptions: FakeSub[];
  transactions: { id: string; customer_id: string; subscription_id: string | null }[];
  adjustments: { id: string; status: string }[];
  webhooks: FakeWebhook[];
}

let fake: Fake;
let savedEnv: Record<string, string | undefined>;
beforeAll(async () => {
  savedEnv = {};
  for (const [k, v] of Object.entries(ENV_OVERRIDE)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  fake = await startFake();
});
afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await fake.close();
  await closeDb();
});
beforeEach(async () => {
  await fake.reset();
  // Paddle prices carry the trial in the catalog; register the prices the plans use.
  await registerPrice("pri_test_free", 0);
  await registerPrice("pri_test_starter", 14);
  await registerPrice("pri_test_pro", 0);
});

async function registerPrice(id: string, trialDays: number) {
  await fetch(`${fake.url}/__fake/paddle/price`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, trialDays }) });
}

const paddleState = () => fake.state<FakePaddleState>("paddle");

async function postWebhook(payload: string, header: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new Request("http://flowline.test/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(header ? { "paddle-signature": header } : {}) },
    body: payload,
  });
  const res = await webhookRoute(req, undefined);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/**
 * Sequential events get strictly increasing occurred_at instants unless a test sets one:
 * a same-instant tie deliberately takes the canonical-fetch path (tested explicitly below).
 */
let tick = 0;
async function emit(body: Record<string, unknown>): Promise<{ id: string; payload: string; header: string }> {
  if (body.occurredAt === undefined) body = { ...body, occurredAt: new Date(Date.now() + ++tick * 1000).toISOString() };
  const res = await fetch(`${fake.url}/__fake/paddle/emit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()) as { id: string; payload: string; header: string };
}

async function accountRow(workspaceId: string) {
  const [row] = await db.select().from(schema.billingAccount).where(eq(schema.billingAccount.workspaceId, workspaceId));
  return row ?? null;
}

async function auditRows(workspaceId: string, action: string) {
  return db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, workspaceId), eq(schema.auditEvent.action, action)));
}

/** Full happy path: checkout at the fake, pay, apply the two webhooks the provider sent. */
async function subscribedWorkspace() {
  const owner = await makeUser("pdl-owner");
  const ws = await createWorkspace(owner, unique("Paddle Co"));
  const { url } = await startCheckout(owner, ws.id, "test_starter");
  // Paddle sends the buyer to OUR checkout page with the transaction id in _ptxn.
  const checkoutUrl = new URL(url);
  expect(checkoutUrl.origin + checkoutUrl.pathname).toBe(`${process.env.FLOWLINE_PUBLIC_URL?.replace(/\/$/, "")}/billing/checkout`);
  expect(checkoutUrl.searchParams.get("ws")).toBe(ws.slug);
  const txnId = checkoutUrl.searchParams.get("_ptxn");
  expect(txnId).toMatch(/^txn_[a-z0-9_]+$/i);
  // Paying in the (fake) Paddle.js overlay; Paddle.js then goes to the successUrl our page passed.
  const successUrl = `${process.env.FLOWLINE_PUBLIC_URL?.replace(/\/$/, "")}/w/${ws.slug}/settings?billing=success`;
  const paid = await fetch(`${fake.url}/paddle/checkout/${txnId}/complete?success_url=${encodeURIComponent(successUrl)}`, { method: "POST", redirect: "manual" });
  expect(paid.status).toBe(303);
  expect(paid.headers.get("location")).toBe(successUrl);
  const s = await paddleState();
  const sub = s.subscriptions.at(-1)!;
  for (const w of s.webhooks.filter((x) => x.type === "transaction.completed" || x.type === "subscription.created")) {
    const res = await postWebhook(w.payload, w.header);
    expect(res.status).toBe(200);
    // Checkout emits both events in (usually) the same instant, like Paddle: a tie then
    // applies the provider's canonical state. Either way it must be applied.
    expect(res.body.outcome).toMatch(/^applied(_canonical)?$/);
  }
  const account = await accountRow(ws.id);
  expect(account?.subscriptionId).toBe(sub.id);
  return { owner, ws, sub, account: account! };
}

describe("paddle billing: checkout and subscription lifecycle", () => {
  it("checkout + webhooks link the subscription and put plan entitlements in force", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    expect(account.provider).toBe("paddle");
    expect(account.status).toBe("trialing"); // pri_test_starter has a 14-day catalog trial
    expect(account.planId).toBe("test_starter");
    expect(account.trialEnd).not.toBeNull();
    expect(sub.customer_id).toBe(account.customerId);

    const ent = await getEntitlements(db, ws.id);
    expect(ent).toEqual({ maxMonthlyExecutions: 5000, monthlyUsageCapMicros: 50000000, maxConcurrentRuns: 4 });

    const state = await getBillingState(ws.id);
    expect(state.configured).toBe(true);
    expect(state.provider).toBe("paddle");
    expect(state.providerMode).toBe("sandbox");
    expect(state.planInForce).toBe("test_starter");
    expect(state.plans.map((p) => p.id)).toEqual(["test_free", "test_starter", "test_pro"]);

    expect(await auditRows(ws.id, "billing.checkout_started")).toHaveLength(1);
    expect((await auditRows(ws.id, "billing.subscription_updated")).length).toBeGreaterThanOrEqual(2);
  });

  it("upgrade and downgrade (subscription.updated) change entitlements", async () => {
    const { owner, ws, sub, account } = await subscribedWorkspace();

    await changePlan(owner, ws.id, "test_pro");
    expect((await paddleState()).subscriptions.find((x) => x.id === sub.id)?.items[0]!.price.id).toBe("pri_test_pro");
    // The provider confirmed with a webhook; that is what applies the change locally.
    const upHook = (await paddleState()).webhooks.filter((w) => w.type === "subscription.updated").at(-1)!;
    expect((await postWebhook(upHook.payload, upHook.header)).body.outcome).toMatch(/^applied(_canonical)?$/);
    expect((await accountRow(ws.id))!.planId).toBe("test_pro");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: null, monthlyUsageCapMicros: null, maxConcurrentRuns: 10 });

    await changePlan(owner, ws.id, "test_starter");
    const downHook = (await paddleState()).webhooks.filter((w) => w.type === "subscription.updated").at(-1)!;
    await postWebhook(downHook.payload, downHook.header);
    expect((await accountRow(ws.id))!.planId).toBe("test_starter");
    expect((await getEntitlements(db, ws.id))!.maxMonthlyExecutions).toBe(5000);

    const planAudits = await auditRows(ws.id, "billing.plan_changed");
    expect(planAudits).toHaveLength(2);
    expect(account.planId).toBe("test_starter");
  });

  it("cancel at period end (scheduled_change), then subscription.canceled falls back to free-plan entitlements", async () => {
    const { owner, ws, sub } = await subscribedWorkspace();

    await cancel(owner, ws.id, true);
    expect((await paddleState()).subscriptions.find((x) => x.id === sub.id)?.scheduled_change?.action).toBe("cancel");
    const updHook = (await paddleState()).webhooks.filter((w) => w.type === "subscription.updated").at(-1)!;
    await postWebhook(updHook.payload, updHook.header);
    const scheduled = (await accountRow(ws.id))!;
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.status).toBe("trialing"); // still in force until the period ends

    const del = await emit({ type: "subscription.canceled", customer: scheduled.customerId, subscription: { id: sub.id } });
    await postWebhook(del.payload, del.header);
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    // Free plan now governs.
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
    expect(await auditRows(ws.id, "billing.cancelled")).toHaveLength(1);
  });

  it("immediate cancellation applies subscription.canceled straight away", async () => {
    const { owner, ws, sub } = await subscribedWorkspace();
    await cancel(owner, ws.id, false);
    expect((await paddleState()).subscriptions.find((x) => x.id === sub.id)?.status).toBe("canceled");
    const hook = (await paddleState()).webhooks.filter((w) => w.type === "subscription.canceled").at(-1)!;
    await postWebhook(hook.payload, hook.header);
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
  });

  it("payment failed (subscription.past_due) → past_due with free-plan entitlements; recovery restores", async () => {
    const { ws, sub, account } = await subscribedWorkspace();

    const res = await fetch(`${fake.url}/__fake/paddle/fail-payment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.id }) });
    const { payload, header } = (await res.json()) as { payload: string; header: string };
    // Emitted by the fake at "now" — possibly the same instant as checkout, which takes the canonical path.
    expect((await postWebhook(payload, header)).body.outcome).toMatch(/^applied(_canonical)?$/);
    expect((await accountRow(ws.id))!.status).toBe("past_due");
    // past_due means the paid plan's entitlements are no longer in force.
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
    expect(await auditRows(ws.id, "billing.payment_failed")).toHaveLength(1);

    // Paddle recovers the payment and the subscription goes active again.
    const recovered = await emit({ type: "subscription.updated", customer: account.customerId, subscription: { id: sub.id, status: "active", price: "pri_test_starter" } });
    await postWebhook(recovered.payload, recovered.header);
    expect((await accountRow(ws.id))!.status).toBe("active");
    expect((await getEntitlements(db, ws.id))!.maxConcurrentRuns).toBe(4);
  });

  it("paused drops paid entitlements; resumed restores them", async () => {
    const { ws, sub, account } = await subscribedWorkspace();

    const paused = await emit({ type: "subscription.paused", customer: account.customerId, subscription: { id: sub.id, status: "paused", current_billing_period: null } });
    await postWebhook(paused.payload, paused.header);
    expect((await accountRow(ws.id))!.status).toBe("paused");
    // paused means the paid plan's entitlements are not in force.
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });

    const resumed = await emit({ type: "subscription.resumed", customer: account.customerId, subscription: { id: sub.id, status: "active", price: "pri_test_starter" } });
    await postWebhook(resumed.payload, resumed.header);
    expect((await accountRow(ws.id))!.status).toBe("active");
    expect((await getEntitlements(db, ws.id))!.maxConcurrentRuns).toBe(4);
  });

  it("a test refund (adjustment.created) is audited without touching subscription state", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const txn = (await paddleState()).transactions.find((x) => x.subscription_id === sub.id)!;

    // Ops refunds the transaction at the provider (sandbox auto-approves).
    const res = await fetch(`${fake.url}/paddle/adjustments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer pdl_sdbx_fake_billing" },
      body: JSON.stringify({ action: "refund", transaction_id: txn.id, items: [{ item_id: "txni_1", type: "full" }], reason: "customer request" }),
    });
    expect(res.status).toBe(201);

    const hook = (await paddleState()).webhooks.filter((w) => w.type === "adjustment.created").at(-1)!;
    expect((await postWebhook(hook.payload, hook.header)).body.outcome).toMatch(/^applied(_canonical)?$/);
    const after = (await accountRow(ws.id))!;
    expect(after.status).toBe(account.status);
    expect(after.planId).toBe(account.planId);
    const refunds = await auditRows(ws.id, "billing.refunded");
    expect(refunds).toHaveLength(1);
    expect((refunds[0]!.data as { refundId?: string }).refundId).toMatch(/^adj_fake_/);
  });
});

describe("paddle billing: webhook robustness", () => {
  it("a duplicate event id is acknowledged without re-applying", async () => {
    const { ws } = await subscribedWorkspace();
    const createdHook = (await paddleState()).webhooks.find((w) => w.type === "subscription.created")!;
    const again = await postWebhook(createdHook.payload, createdHook.header);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    const events = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, createdHook.id));
    expect(events).toHaveLength(1);
    const account = await accountRow(ws.id);
    expect(account!.lastEventAt!.getTime()).toBe(events[0]!.createdAt.getTime());
  });

  it("an out-of-order (older) event is recorded as ignored_stale and does not change state", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const newer = await emit({ type: "subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "pri_test_pro" } });
    await postWebhook(newer.payload, newer.header);
    expect((await accountRow(ws.id))!.planId).toBe("test_pro");
    // …then an older occurred_at event arrives late and must be ignored.
    const older = await emit({
      type: "subscription.updated",
      customer: account.customerId,
      subscription: { id: sub.id, price: "pri_test_starter" },
      occurredAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    });
    const res = await postWebhook(older.payload, older.header);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored_stale");
    expect((await accountRow(ws.id))!.planId).toBe("test_pro");
  });

  it("a replayed old signature and a bad signature both get 401", async () => {
    const { account } = await subscribedWorkspace();
    const nowSec = Math.floor(Date.now() / 1000);
    const replay = await emit({ type: "subscription.updated", customer: account!.customerId, subscription: { id: "sub_fake_x" }, signAt: nowSec - 400 });
    expect((await postWebhook(replay.payload, replay.header)).status).toBe(401);

    const good = await emit({ type: "subscription.updated", customer: account!.customerId, subscription: { id: "sub_fake_x" } });
    expect((await postWebhook(good.payload.replace(account!.customerId, "ctm_evil"), good.header)).status).toBe(401);
    expect((await postWebhook(good.payload, null)).status).toBe(401);
  });

  it("an unknown customer is recorded and acknowledged without state change", async () => {
    const { account } = await subscribedWorkspace();
    const unknown = await emit({ type: "subscription.created", customer: "ctm_nobody", subscription: { id: "sub_nobody" } });
    const res = await postWebhook(unknown.payload, unknown.header);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored_unknown_customer");
    const [event] = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, unknown.id));
    expect(event.outcome).toBe("ignored_unknown_customer");
    expect(event.workspaceId).toBeNull();
    // Known account untouched.
    expect((await accountRow(account!.workspaceId))!.planId).toBe("test_starter");
  });

  it("applyWebhookEvent throws on verification failure before touching the DB", async () => {
    await expect(applyWebhookEvent("{}", null)).rejects.toThrowError();
  });
});

describe("paddle billing: same-instant webhook ordering", () => {
  it("a same-instant updated delivered after canceled does not reactivate the subscription (canonical fetch)", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const t = new Date(Date.now() + 60_000).toISOString();
    // Both events carry the same occurred_at instant. The "updated" reflects pre-cancel
    // state and must not move the fake's provider state (mutate: false).
    const updated = await emit({ type: "subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "pri_test_pro" }, occurredAt: t, mutate: false });
    const canceled = await emit({ type: "subscription.canceled", customer: account.customerId, subscription: { id: sub.id }, occurredAt: t });

    expect((await postWebhook(canceled.payload, canceled.header)).body.outcome).toMatch(/^applied/);
    expect((await accountRow(ws.id))!.status).toBe("canceled");

    // The older-in-fact update lands at the same instant: order is ambiguous, so the
    // provider's canonical state (canceled) wins over the payload.
    const res = await postWebhook(updated.payload, updated.header);
    expect(res.body.outcome).toBe("applied_canonical");
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    // Entitlements are not restored.
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });

    const [event] = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, updated.id));
    expect(event.outcome).toBe("applied_canonical");
    expect(event.detail).toContain("provider state");
  });

  it("the reverse order (updated then canceled at the same instant) also ends in the canonical state", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const t = new Date(Date.now() + 60_000).toISOString();
    const updated = await emit({ type: "subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "pri_test_pro" }, occurredAt: t, mutate: false });
    const canceled = await emit({ type: "subscription.canceled", customer: account.customerId, subscription: { id: sub.id }, occurredAt: t });

    await postWebhook(updated.payload, updated.header);
    const res = await postWebhook(canceled.payload, canceled.header);
    expect(res.body.outcome).toBe("applied_canonical");
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
  });

  it("a provider outage during a same-instant event fails the event without changing state; a redelivery applies", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const t = new Date(Date.now() + 60_000).toISOString();
    // Pin lastEventAt to t so the canceled event below is a same-instant tie.
    const pin = await emit({ type: "subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "pri_test_starter" }, occurredAt: t, mutate: false });
    await postWebhook(pin.payload, pin.header);
    const pinned = (await accountRow(ws.id))!;
    expect(pinned.lastEventAt!.toISOString()).toBe(t);

    // The canonical fetch fails: state must stay untouched and the event is marked failed.
    await fake.fault({ provider: "paddle", pathPattern: "/subscriptions/", mode: "500" });
    const canceled = await emit({ type: "subscription.canceled", customer: account.customerId, subscription: { id: sub.id }, occurredAt: t });
    const res = await postWebhook(canceled.payload, canceled.header);
    expect(res.body.outcome).toBe("failed");
    const after = (await accountRow(ws.id))!;
    expect(after.status).toBe(pinned.status);
    expect(after.planId).toBe(pinned.planId);
    const [failed] = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, canceled.id));
    expect(failed.outcome).toBe("failed");
    expect(failed.detail).toContain("canonical fetch failed");

    // The fault was one-shot. The redelivery must be reprocessed despite the dedupe row…
    const redelivered = await postWebhook(canceled.payload, canceled.header);
    expect(redelivered.body.duplicate).toBe(false);
    expect(redelivered.body.outcome).toBe("applied_canonical");
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
    // …and there is still exactly one event row, now with the final outcome.
    const events = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, canceled.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe("applied_canonical");
  });
});

describe("paddle billing: provider failures change nothing", () => {
  it("a 5xx during checkout surfaces 502 and stores no account", async () => {
    const owner = await makeUser("pdl-fail");
    const ws = await createWorkspace(owner, unique("Fail Co"));
    await fake.fault({ provider: "paddle", pathPattern: "/customers", mode: "500" });
    await expectHttpError(startCheckout(owner, ws.id, "test_starter"), 502, "BILLING_UNAVAILABLE");
    expect(await accountRow(ws.id)).toBeNull();
    expect(await auditRows(ws.id, "billing.checkout_started")).toHaveLength(0);
  });

  it("a 5xx during plan change surfaces 502 and leaves the plan untouched", async () => {
    const { owner, ws } = await subscribedWorkspace();
    await fake.fault({ provider: "paddle", pathPattern: "/subscriptions/", mode: "500" });
    await expectHttpError(changePlan(owner, ws.id, "test_pro"), 502, "BILLING_UNAVAILABLE");
    expect((await accountRow(ws.id))!.planId).toBe("test_starter");
    expect(await auditRows(ws.id, "billing.plan_changed")).toHaveLength(0);
  });
});

describe("paddle billing: usage reconciliation", () => {
  it("is a documented no-op: Paddle has no usage-metering API, so nothing is sent or marked reported", async () => {
    const { ws } = await subscribedWorkspace();
    const periodStart = monthStart();
    await db.insert(schema.usageEvent).values([
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 1500, quantity: 1 },
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 2500, quantity: 1 },
    ]);

    const result = await reconcileUsage(ws.id, periodStart);
    expect(result.configured).toBe(true);
    expect(result.reported).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    for (const s of result.skipped) expect(s.reason).toContain("no usage-metering API");
    // Nothing was recorded as reported, and no provider call attempted a usage report.
    expect(await db.select().from(schema.usageReport).where(eq(schema.usageReport.workspaceId, ws.id))).toHaveLength(0);
    const requests = await fake.requests("paddle");
    expect(requests.filter((r) => /meter|usage/i.test(r.path))).toHaveLength(0);
  });
});

describe("paddle billing: permissions", () => {
  it("billing.manage stays owner-only with the Paddle provider (non-members get 404)", async () => {
    const { ws } = await subscribedWorkspace();
    const editor = await makeUser("pdl-editor");
    const outsider = await makeUser("pdl-outsider");
    await addMember(ws.id, editor.id, "editor");

    await expectHttpError(requireWorkspace(editor, ws.id, "billing.manage"), 403, "FORBIDDEN");
    await expectHttpError(requireWorkspace(outsider, ws.id, "billing.manage"), 404, "NOT_FOUND");
  });
});
