import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectProviderError, makeCtx, provider, queryOf, runAction, startFake, stripeCreds, type Fake } from "./helpers";

const p = provider("stripe");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("stripe identity", () => {
  it("returns the account for a test-mode key", async () => {
    const id = await p.identity(makeCtx(p, stripeCreds));
    expect(id).toEqual({ accountId: "acct_fake123", label: "alice@flowline.test" });
    const r = await fake.lastRequest("stripe");
    expect(r.path).toBe("/v1/account");
    expect(r.headers["x-auth-scheme"]).toBe("bearer");
  });

  it.each(["sk_live_123", "rk_live_123", "pk_test_123"])("rejects the live/invalid key %s before any HTTP request", async (token) => {
    await fake.reset();
    const err = await expectProviderError(p.identity(makeCtx(p, { type: "api_key", token })), "client");
    expect(err.message).toBe("Only Stripe test-mode keys are allowed");
    expect(await fake.requests("stripe")).toHaveLength(0);
  });
});

describe("stripe.list_charges", () => {
  it("lists seeded charges", async () => {
    const out = await runAction<{ charges: { id: string; amount: number }[]; has_more: boolean }>(
      "stripe.list_charges",
      makeCtx(p, stripeCreds),
      { limit: 5 },
    );
    expect(out.charges[0]).toMatchObject({ id: "ch_test_1", amount: 12500, currency: "usd", status: "succeeded" });
    expect(out.has_more).toBe(false);
    const r = await fake.lastRequest("stripe");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/v1/charges");
    expect(queryOf(r).get("limit")).toBe("5");
  });
});

describe("stripe.create_refund", () => {
  it("sends a form-encoded body with the Idempotency-Key header", async () => {
    const ctx = makeCtx(p, stripeCreds);
    const out = await runAction<{ id: string; amount: number; status: string }>("stripe.create_refund", ctx, {
      charge: "ch_test_1",
      amount: 500,
    });
    expect(out).toMatchObject({ amount: 500, currency: "usd", status: "succeeded", charge: "ch_test_1" });
    const r = await fake.lastRequest("stripe");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/refunds");
    expect(r.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(r.headers["idempotency-key"]).toBe(ctx.idempotencyKey);
    expect(r.body).toBe("charge=ch_test_1&amount=500");
  });

  it("the same Idempotency-Key twice yields one refund, not two", async () => {
    const ctx = makeCtx(p, stripeCreds);
    const first = await runAction<{ id: string }>("stripe.create_refund", ctx, { charge: "ch_test_1", amount: 100 });
    const second = await runAction<{ id: string }>("stripe.create_refund", ctx, { charge: "ch_test_1", amount: 100 });
    expect(second.id).toBe(first.id);
    const state = await fake.state<{ refunds: { idempotencyKey?: string }[] }>("stripe");
    expect(state.refunds.filter((r) => r.idempotencyKey === ctx.idempotencyKey)).toHaveLength(1);
  });

  it("maps an unknown charge to not_found", async () => {
    await expectProviderError(runAction("stripe.create_refund", makeCtx(p, stripeCreds), { charge: "ch_nope" }), "not_found");
  });
});
