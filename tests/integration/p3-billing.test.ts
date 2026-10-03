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

interface FakeSub {
  id: string;
  customer: string;
  status: string;
  items: { data: { price: { id: string } }[] };
  cancel_at_period_end: boolean;
}
interface FakeWebhook {
  id: string;
  type: string;
  payload: string;
  header: string;
}
interface FakeStripeState {
  subscriptions: FakeSub[];
  meterEvents: { event_name: string; identifier: string; payload: { value: string } }[];
  webhooks: FakeWebhook[];
}

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
  await closeDb();
});
beforeEach(async () => {
  await fake.reset();
});

const stripeState = () => fake.state<FakeStripeState>("stripe");

async function postWebhook(payload: string, header: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new Request("http://flowline.test/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(header ? { "stripe-signature": header } : {}) },
    body: payload,
  });
  const res = await webhookRoute(req, undefined);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/**
 * Sequential events get strictly increasing `created` seconds unless a test sets one: provider timestamps have
 * 1-second resolution, and same-second ties deliberately take the canonical-fetch path (tested explicitly below).
 */
let tick = 0;
async function emit(body: Record<string, unknown>): Promise<{ id: string; payload: string; header: string }> {
  if (body.created === undefined) body = { ...body, created: Math.floor(Date.now() / 1000) + ++tick };
  const res = await fetch(`${fake.url}/__fake/stripe/emit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
  const owner = await makeUser("bill-owner");
  const ws = await createWorkspace(owner, unique("Billing Co"));
  const { url } = await startCheckout(owner, ws.id, "test_starter");
  const paid = await fetch(`${url}/complete`, { method: "POST", redirect: "manual" });
  expect(paid.status).toBe(303);
  const s = await stripeState();
  const sub = s.subscriptions.at(-1)!;
  for (const w of s.webhooks.filter((x) => x.type === "checkout.session.completed" || x.type === "customer.subscription.created")) {
    const res = await postWebhook(w.payload, w.header);
    expect(res.status).toBe(200);
    // Checkout emits both events in (usually) the same second, like Stripe: the second one then applies the
    // provider's canonical state. Either way it must be applied; the state checks below verify the result.
    expect(res.body.outcome).toMatch(/^applied(_canonical)?$/);
  }
  const account = await accountRow(ws.id);
  expect(account?.subscriptionId).toBe(sub.id);
  return { owner, ws, sub, account: account! };
}

describe("billing: checkout and subscription lifecycle", () => {
  it("checkout + webhooks link the subscription and put plan entitlements in force", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    expect(account.status).toBe("trialing"); // Test Starter has trialDays: 14
    expect(account.planId).toBe("test_starter");
    expect(account.trialEnd).not.toBeNull();
    expect(sub.customer).toBe(account.customerId);

    const ent = await getEntitlements(db, ws.id);
    expect(ent).toEqual({ maxMonthlyExecutions: 5000, monthlyUsageCapMicros: 50000000, maxConcurrentRuns: 4 });

    const state = await getBillingState(ws.id);
    expect(state.configured).toBe(true);
    expect(state.planInForce).toBe("test_starter");
    expect(state.plans.map((p) => p.id)).toEqual(["test_free", "test_starter", "test_pro"]);

    expect(await auditRows(ws.id, "billing.checkout_started")).toHaveLength(1);
    expect((await auditRows(ws.id, "billing.subscription_updated")).length).toBeGreaterThanOrEqual(2);
  });

  it("upgrade and downgrade (subscription.updated) change entitlements", async () => {
    const { owner, ws, sub, account } = await subscribedWorkspace();

    await changePlan(owner, ws.id, "test_pro");
    expect((await stripeState()).subscriptions.find((x) => x.id === sub.id)?.items.data[0]!.price.id).toBe("price_test_pro");
    // The provider confirmed with a webhook; that is what applies the change locally.
    const upHook = (await stripeState()).webhooks.filter((w) => w.type === "customer.subscription.updated").at(-1)!;
    expect((await postWebhook(upHook.payload, upHook.header)).body.outcome).toMatch(/^applied(_canonical)?$/); // may share a second with checkout
    expect((await accountRow(ws.id))!.planId).toBe("test_pro");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: null, monthlyUsageCapMicros: null, maxConcurrentRuns: 10 });

    await changePlan(owner, ws.id, "test_starter");
    const downHook = (await stripeState()).webhooks.filter((w) => w.type === "customer.subscription.updated").at(-1)!;
    await postWebhook(downHook.payload, downHook.header);
    expect((await accountRow(ws.id))!.planId).toBe("test_starter");
    expect((await getEntitlements(db, ws.id))!.maxMonthlyExecutions).toBe(5000);

    const planAudits = await auditRows(ws.id, "billing.plan_changed");
    expect(planAudits).toHaveLength(2);
    expect(account.planId).toBe("test_starter");
  });

  it("cancel at period end, then deletion falls back to free-plan entitlements", async () => {
    const { owner, ws, sub } = await subscribedWorkspace();

    await cancel(owner, ws.id, true);
    expect((await stripeState()).subscriptions.find((x) => x.id === sub.id)?.cancel_at_period_end).toBe(true);
    const updHook = (await stripeState()).webhooks.filter((w) => w.type === "customer.subscription.updated").at(-1)!;
    await postWebhook(updHook.payload, updHook.header);
    expect((await accountRow(ws.id))!.cancelAtPeriodEnd).toBe(true);

    const del = await emit({ type: "customer.subscription.deleted", customer: (await accountRow(ws.id))!.customerId, subscription: { id: sub.id } });
    await postWebhook(del.payload, del.header);
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    // Free plan now governs.
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
    expect(await auditRows(ws.id, "billing.cancelled")).toHaveLength(1);
  });

  it("payment failed → past_due with free-plan entitlements; invoice.paid restores", async () => {
    const { ws, sub, account } = await subscribedWorkspace();

    const res = await fetch(`${fake.url}/__fake/stripe/fail-payment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.id }) });
    const { payload, header } = (await res.json()) as { payload: string; header: string };
    // Emitted by the fake at "now" — possibly the same second as checkout, which takes the canonical path.
    expect((await postWebhook(payload, header)).body.outcome).toMatch(/^applied(_canonical)?$/);
    expect((await accountRow(ws.id))!.status).toBe("past_due");
    // past_due means the paid plan's entitlements are no longer in force.
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
    expect(await auditRows(ws.id, "billing.payment_failed")).toHaveLength(1);

    const paid = await emit({ type: "invoice.paid", customer: account.customerId, subscription: { id: sub.id } });
    await postWebhook(paid.payload, paid.header);
    expect((await accountRow(ws.id))!.status).toBe("active");
    expect((await getEntitlements(db, ws.id))!.maxConcurrentRuns).toBe(4);
  });
});

describe("billing: webhook robustness", () => {
  it("a duplicate event id is acknowledged without re-applying", async () => {
    const { ws } = await subscribedWorkspace();
    const createdHook = (await stripeState()).webhooks.find((w) => w.type === "customer.subscription.created")!;
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
    // Apply a newer update (upgrade to pro)…
    const newer = await emit({ type: "customer.subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "price_test_pro" } });
    await postWebhook(newer.payload, newer.header);
    expect((await accountRow(ws.id))!.planId).toBe("test_pro");
    // …then an older created event arrives late and must be ignored.
    const olderSec = Math.floor(Date.now() / 1000) - 3600;
    const older = await emit({ type: "customer.subscription.created", customer: account.customerId, subscription: { id: sub.id, price: "price_test_starter" }, created: olderSec });
    const res = await postWebhook(older.payload, older.header);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored_stale");
    expect((await accountRow(ws.id))!.planId).toBe("test_pro");
  });

  it("a replayed old signature and a bad signature both get 401", async () => {
    const { account } = await subscribedWorkspace();
    const nowSec = Math.floor(Date.now() / 1000);
    const replay = await emit({ type: "invoice.paid", customer: account!.customerId, signAt: nowSec - 400 });
    expect((await postWebhook(replay.payload, replay.header)).status).toBe(401);

    const good = await emit({ type: "invoice.paid", customer: account!.customerId });
    expect((await postWebhook(good.payload.replace(account!.customerId, "cus_evil"), good.header)).status).toBe(401);
    expect((await postWebhook(good.payload, null)).status).toBe(401);
  });

  it("an unknown customer is recorded and acknowledged without state change", async () => {
    const { account } = await subscribedWorkspace();
    const unknown = await emit({ type: "customer.subscription.created", customer: "cus_nobody", subscription: { id: "sub_nobody" } });
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

describe("billing: same-second webhook ordering", () => {
  it("a same-second updated delivered after deleted does not reactivate the subscription (canonical fetch)", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const t = Math.floor(Date.now() / 1000);
    // Both events carry the same created second. The "updated" reflects pre-delete
    // state and must not move the fake's provider state (mutate: false).
    const updated = await emit({ type: "customer.subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "price_test_pro" }, created: t, mutate: false });
    const deleted = await emit({ type: "customer.subscription.deleted", customer: account.customerId, subscription: { id: sub.id }, created: t });

    expect((await postWebhook(deleted.payload, deleted.header)).body.outcome).toMatch(/^applied/);
    expect((await accountRow(ws.id))!.status).toBe("canceled");

    // The older-in-fact update lands in the same second: order is ambiguous, so the
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

  it("the reverse order (updated then deleted in the same second) also ends in the canonical state", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const t = Math.floor(Date.now() / 1000);
    const updated = await emit({ type: "customer.subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "price_test_pro" }, created: t, mutate: false });
    const deleted = await emit({ type: "customer.subscription.deleted", customer: account.customerId, subscription: { id: sub.id }, created: t });

    await postWebhook(updated.payload, updated.header);
    const res = await postWebhook(deleted.payload, deleted.header);
    expect(res.body.outcome).toBe("applied_canonical");
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
  });

  it("a provider outage during a same-second event fails the event without changing state; a redelivery applies", async () => {
    const { ws, sub, account } = await subscribedWorkspace();
    const t = Math.floor(Date.now() / 1000);
    // Pin lastEventAt to t so the deleted event below is a same-second tie.
    const pin = await emit({ type: "customer.subscription.updated", customer: account.customerId, subscription: { id: sub.id, price: "price_test_starter" }, created: t, mutate: false });
    await postWebhook(pin.payload, pin.header);
    const pinned = (await accountRow(ws.id))!;
    expect(pinned.lastEventAt!.getTime()).toBe(t * 1000);

    // The canonical fetch fails: state must stay untouched and the event is marked failed.
    await fake.fault({ provider: "stripe", pathPattern: "/v1/subscriptions/", mode: "500" });
    const deleted = await emit({ type: "customer.subscription.deleted", customer: account.customerId, subscription: { id: sub.id }, created: t });
    const res = await postWebhook(deleted.payload, deleted.header);
    expect(res.status).toBe(503);
    expect(res.body.received).toBe(false);
    expect(res.body.outcome).toBe("failed");
    const after = (await accountRow(ws.id))!;
    expect(after.status).toBe(pinned.status);
    expect(after.planId).toBe(pinned.planId);
    const [failed] = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, deleted.id));
    expect(failed.outcome).toBe("failed");
    expect(failed.detail).toContain("canonical fetch failed");

    // The fault was one-shot. The redelivery must be reprocessed despite the dedupe row…
    const redelivered = await postWebhook(deleted.payload, deleted.header);
    expect(redelivered.status).toBe(200);
    expect(redelivered.body.duplicate).toBe(false);
    expect(redelivered.body.outcome).toBe("applied_canonical");
    expect((await accountRow(ws.id))!.status).toBe("canceled");
    expect(await getEntitlements(db, ws.id)).toEqual({ maxMonthlyExecutions: 100, monthlyUsageCapMicros: 1000000, maxConcurrentRuns: 1 });
    // …and there is still exactly one event row, now with the final outcome.
    const events = await db.select().from(schema.billingEvent).where(eq(schema.billingEvent.id, deleted.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe("applied_canonical");
    const auditBeforeDuplicate = await auditRows(ws.id, "billing.subscription_updated");
    const duplicate = await postWebhook(deleted.payload, deleted.header);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(await auditRows(ws.id, "billing.subscription_updated")).toHaveLength(auditBeforeDuplicate.length);
  });
});

describe("billing: provider failures change nothing", () => {
  it("a 5xx during checkout surfaces 502 and stores no account", async () => {
    const owner = await makeUser("bill-fail");
    const ws = await createWorkspace(owner, unique("Fail Co"));
    await fake.fault({ provider: "stripe", pathPattern: "/v1/customers", mode: "500" });
    await expectHttpError(startCheckout(owner, ws.id, "test_starter"), 502, "BILLING_UNAVAILABLE");
    expect(await accountRow(ws.id)).toBeNull();
    expect(await auditRows(ws.id, "billing.checkout_started")).toHaveLength(0);
  });

  it("a 5xx during plan change surfaces 502 and leaves the plan untouched", async () => {
    const { owner, ws } = await subscribedWorkspace();
    await fake.fault({ provider: "stripe", pathPattern: "/v1/subscriptions/", mode: "500" });
    await expectHttpError(changePlan(owner, ws.id, "test_pro"), 502, "BILLING_UNAVAILABLE");
    expect((await accountRow(ws.id))!.planId).toBe("test_starter");
    expect(await auditRows(ws.id, "billing.plan_changed")).toHaveLength(0);
  });
});

describe("billing: usage reconciliation", () => {
  it("reports ledger totals once per period + metric; re-running reports nothing new", async () => {
    const { ws } = await subscribedWorkspace();
    const periodStart = monthStart();
    await db.insert(schema.usageEvent).values([
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 1500, quantity: 1 },
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 2500, quantity: 1 },
      { workspaceId: ws.id, kind: "ai", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 4000, quantity: 1 },
      // Not billable / not settled: must not be counted.
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: false, idempotencyKey: unique("ue"), costMicros: 9999, quantity: 1 },
      { workspaceId: ws.id, kind: "execution", status: "reserved", billable: true, idempotencyKey: unique("ue"), costMicros: 9999, quantity: 1 },
    ]);

    const first = await reconcileUsage(ws.id, periodStart);
    expect(first.reported).toEqual([
      { metric: "executions", quantity: 2 },
      { metric: "cost_micros", quantity: 8000 },
    ]);
    expect(first.skipped).toEqual([]);

    const meters = (await stripeState()).meterEvents;
    expect(meters).toHaveLength(2);
    expect(meters.find((m) => m.event_name === "flowline.executions")?.payload.value).toBe("2");
    expect(meters.find((m) => m.event_name === "flowline.cost_micros")?.payload.value).toBe("8000");

    const reports = await db.select().from(schema.usageReport).where(eq(schema.usageReport.workspaceId, ws.id));
    expect(reports).toHaveLength(2);
    for (const r of reports) {
      expect(r.status).toBe("reported");
      expect(Number(r.ledgerTotal)).toBe(Number(r.quantity));
    }

    const second = await reconcileUsage(ws.id, periodStart);
    expect(second.reported).toEqual([]);
    expect(second.skipped).toHaveLength(2);
    expect((await stripeState()).meterEvents).toHaveLength(2);
  });

  it("reports only newly accrued usage (monotonic deltas) on later reconciles", async () => {
    const { ws } = await subscribedWorkspace();
    const periodStart = monthStart();
    const addUsage = (rows: { costMicros: number }[]) =>
      db.insert(schema.usageEvent).values(rows.map((r) => ({ workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: r.costMicros, quantity: 1 })));

    await addUsage([{ costMicros: 1500 }, { costMicros: 2500 }]);
    const first = await reconcileUsage(ws.id, periodStart);
    expect(first.reported).toEqual([
      { metric: "executions", quantity: 2 },
      { metric: "cost_micros", quantity: 4000 },
    ]);

    // Usage accrues after the first reconcile: a later run reports only the delta.
    await addUsage([{ costMicros: 500 }]);
    const second = await reconcileUsage(ws.id, periodStart);
    expect(second.reported).toEqual([
      { metric: "executions", quantity: 1 },
      { metric: "cost_micros", quantity: 500 },
    ]);
    expect(second.skipped).toEqual([]);

    // Nothing new: nothing reported, with a reason.
    const third = await reconcileUsage(ws.id, periodStart);
    expect(third.reported).toEqual([]);
    expect(third.skipped).toHaveLength(2);
    for (const s of third.skipped) expect(s.reason).toContain("no new usage");

    // The provider saw the deltas; their sum equals the ledger total.
    const meters = (await stripeState()).meterEvents;
    const sum = (name: string) => meters.filter((m) => m.event_name === name).reduce((n, m) => n + Number(m.payload.value), 0);
    expect(meters.filter((m) => m.event_name === "flowline.executions")).toHaveLength(2);
    expect(sum("flowline.executions")).toBe(3);
    expect(sum("flowline.cost_micros")).toBe(4500);

    // One row per delta: quantity is the delta, ledgerTotal the cumulative total.
    const reports = await db.select().from(schema.usageReport).where(eq(schema.usageReport.workspaceId, ws.id));
    expect(reports).toHaveLength(4);
    expect(new Set(reports.map((r) => r.idempotencyKey)).size).toBe(4);
    const exec = reports.filter((r) => r.metric === "executions").sort((a, b) => a.ledgerTotal - b.ledgerTotal);
    expect(exec.map((r) => r.quantity)).toEqual([2, 1]);
    expect(exec.map((r) => r.ledgerTotal)).toEqual([2, 3]);
  });

  it("a provider failure mid-reconcile leaves no rows and the retry does not double-report", async () => {
    const { ws } = await subscribedWorkspace();
    const periodStart = monthStart();
    await db.insert(schema.usageEvent).values([
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 1500, quantity: 1 },
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 2500, quantity: 1 },
    ]);

    // The provider records the first meter event but the response never arrives:
    // the reconcile must fail and store nothing.
    await fake.fault({ provider: "stripe", pathPattern: "/v1/billing/meter_events", mode: "drop_after_commit" });
    await expectHttpError(reconcileUsage(ws.id, periodStart), 502, "BILLING_UNAVAILABLE");
    expect(await db.select().from(schema.usageReport).where(eq(schema.usageReport.workspaceId, ws.id))).toHaveLength(0);
    expect((await stripeState()).meterEvents).toHaveLength(1); // recorded provider-side, unknown to us

    // Retry: the deterministic identifier is idempotent at the provider — no double count.
    const retry = await reconcileUsage(ws.id, periodStart);
    expect(retry.reported).toEqual([
      { metric: "executions", quantity: 2 },
      { metric: "cost_micros", quantity: 4000 },
    ]);
    const meters = (await stripeState()).meterEvents;
    expect(meters.filter((m) => m.event_name === "flowline.executions")).toHaveLength(1);
    expect(meters.filter((m) => m.event_name === "flowline.cost_micros")).toHaveLength(1);
    const reports = await db.select().from(schema.usageReport).where(eq(schema.usageReport.workspaceId, ws.id));
    expect(reports).toHaveLength(2);
    for (const r of reports) expect(r.status).toBe("reported");
  });

  it("concurrent reconciles for one workspace report the usage exactly once", async () => {
    const { ws } = await subscribedWorkspace();
    const periodStart = monthStart();
    await db.insert(schema.usageEvent).values([
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 1500, quantity: 1 },
      { workspaceId: ws.id, kind: "execution", status: "settled", billable: true, idempotencyKey: unique("ue"), costMicros: 2500, quantity: 1 },
    ]);

    const results = await Promise.all([reconcileUsage(ws.id, periodStart), reconcileUsage(ws.id, periodStart)]);
    // One reconcile reported both metrics; the other observed them as already reported.
    expect(results.filter((r) => r.reported.length === 2)).toHaveLength(1);
    expect(results.filter((r) => r.reported.length === 0 && r.skipped.length === 2)).toHaveLength(1);

    const meters = (await stripeState()).meterEvents;
    expect(meters).toHaveLength(2);
    expect(meters.find((m) => m.event_name === "flowline.executions")?.payload.value).toBe("2");
    expect(meters.find((m) => m.event_name === "flowline.cost_micros")?.payload.value).toBe("4000");
    expect(await db.select().from(schema.usageReport).where(eq(schema.usageReport.workspaceId, ws.id))).toHaveLength(2);
  });
});

describe("billing: permissions", () => {
  it("manage endpoints are owner-only (403 for editor/viewer), non-members get 404", async () => {
    const { ws } = await subscribedWorkspace();
    const editor = await makeUser("bill-editor");
    const viewer = await makeUser("bill-viewer");
    const outsider = await makeUser("bill-outsider");
    await addMember(ws.id, editor.id, "editor");
    await addMember(ws.id, viewer.id, "viewer");

    await expectHttpError(requireWorkspace(editor, ws.id, "billing.manage"), 403, "FORBIDDEN");
    await expectHttpError(requireWorkspace(viewer, ws.id, "billing.manage"), 403, "FORBIDDEN");
    await expectHttpError(requireWorkspace(outsider, ws.id, "billing.manage"), 404, "NOT_FOUND");

    // billing.view: editors may look, viewers may not.
    const asEditor = await requireWorkspace(editor, ws.id, "billing.view");
    expect(asEditor.role).toBe("editor");
    await expectHttpError(requireWorkspace(viewer, ws.id, "billing.view"), 403, "FORBIDDEN");
  });
});
