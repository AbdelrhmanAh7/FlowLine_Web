import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { StripePaymentAdapter } from "@/billing/stripe";
import { POST } from "@/app/api/billing/webhook/route";

const mocks = vi.hoisted(() => ({ db: { transaction: vi.fn() }, audit: vi.fn() }));
vi.mock("@/db", async () => ({ db: mocks.db, schema: await import("@/db/schema") }));
vi.mock("@/server/audit", () => ({ audit: mocks.audit, userActor: vi.fn() }));
vi.mock("@/server/usage", () => ({ monthStart: vi.fn() }));
vi.mock("@/server/platform-settings", () => ({ getSetting: async () => ({ value: "stripe" }) }));
vi.mock("@/server/platform-secrets", () => ({ resolvePlatformCredential: async (purpose: string) => ({ secret: purpose.endsWith("webhook") ? "synthetic-webhook-key" : "sk_test_synthetic" }) }));
vi.mock("@/billing/plans", () => ({ loadBillingPlans: async () => null, planByProviderPrice: vi.fn(), planById: vi.fn() }));

beforeEach(() => { vi.stubEnv("FLOWLINE_TELEMETRY", "off"); mocks.audit.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it.each(["customer.subscription.deleted", "invoice.payment_failed"])("returns retryable failure for signed %s, then applies once on recovery", async (type) => {
  const now = Math.floor(Date.now() / 1000);
  const account = { workspaceId: "workspace", customerId: "cus_synthetic", subscriptionId: "sub_synthetic", status: "active", planId: "paid", lastEventAt: new Date(now * 1000) };
  const events = new Map<string, Record<string, unknown>>();
  let eventId = "";
  // In-memory transaction double exercises the real service's failed-event retry/dedupe branches.
  const tx = {
    insert: () => ({ values: (value: Record<string, unknown>) => {
      eventId = String(value.id);
      const insert = () => { events.set(eventId, { ...value }); };
      return {
        onConflictDoNothing: () => ({ returning: async () => { if (events.has(eventId)) return []; insert(); return [{ id: eventId }]; } }),
        then: (resolve: (value: unknown) => void) => { insert(); resolve(undefined); },
      };
    } }),
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const rows = () => table === schema.billingAccount ? [account] : [...events.values()];
      return { for: async () => rows(), then: (resolve: (value: unknown) => void) => resolve(rows()) };
    } }) }),
    update: (table: unknown) => ({ set: (value: Record<string, unknown>) => ({ where: async () => {
      Object.assign(table === schema.billingAccount ? account : events.get(eventId)!, value);
    } }) }),
    delete: () => ({ where: async () => { events.delete(eventId); } }),
  };
  mocks.db.transaction.mockImplementation(async (fn) => fn(tx));
  const canonical = vi.spyOn(StripePaymentAdapter.prototype, "retrieveSubscription")
    .mockRejectedValueOnce(new Error("Synthetic provider outage"))
    .mockResolvedValue({ id: "sub_synthetic", status: "canceled", priceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEnd: null });
  const payload = JSON.stringify({ id: "evt_synthetic", type, created: now, data: { object: { id: "sub_synthetic", customer: "cus_synthetic", subscription: "sub_synthetic", status: "canceled" } } });
  const signature = createHmac("sha256", "synthetic-webhook-key").update(`${now}.${payload}`).digest("hex");
  const deliver = () => POST(new Request("https://flowline.example/api/billing/webhook", { method: "POST", headers: { "stripe-signature": `t=${now},v1=${signature}` }, body: payload }), undefined);

  const failed = await deliver();
  expect(failed.status).toBe(503);
  expect(Number(failed.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(await failed.json()).toMatchObject({ received: false, outcome: "failed", duplicate: false });
  expect(account.status).toBe("active");
  expect(events.get("evt_synthetic")?.outcome).toBe("failed");
  expect(mocks.audit).not.toHaveBeenCalled();

  const recovered = await deliver();
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({ received: true, duplicate: false, outcome: "applied_canonical" });
  expect(account.status).toBe("canceled");
  expect(events.size).toBe(1);
  expect(events.get("evt_synthetic")?.outcome).toBe("applied_canonical");
  expect(mocks.audit).toHaveBeenCalledOnce();

  const duplicate = await deliver();
  expect(duplicate.status).toBe(200);
  expect(await duplicate.json()).toMatchObject({ received: true, duplicate: true });
  expect(canonical).toHaveBeenCalledTimes(2);
  expect(mocks.audit).toHaveBeenCalledOnce();
  expect(events.size).toBe(1);
});
