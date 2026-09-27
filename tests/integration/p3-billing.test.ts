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

async function emit(body: Record<string, unknown>): Promise<{ id: string; payload: string; header: string }> {
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
    expect(res.body.outcome).toBe("applied");
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
    expect((await postWebhook(upHook.payload, upHook.header)).body.outcome).toBe("applied");
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
    expect((await postWebhook(payload, header)).body.outcome).toBe("applied");
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
