import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeCtx, provider, runAction, startFake, type Fake } from "./helpers";

// #147 AC2/AC3, over the wire: the real adapter (createProviderHttp: headers, JSON body, egress) talks to the fake
// Mizano API (e2e/fakes/provider-server.ts), which replays the stored record for an Idempotency-Key it has already
// seen. Same run + same node => same key => one customer; a new run => a new key => a second record.
let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

// Only a public https origin is accepted by the adapter's `base()`; in FLOWLINE_ENV=test resolveBase redirects the
// request to the fake provider server (allowlisted by startFake), so the origin never leaves the test stack.
const creds = { type: "api_key" as const, token: "test-token", settings: { baseUrl: "https://mizano.test" } };

const customer = {
  name: "Ada Lovelace",
  company: "Analytical Engines Ltd",
  email: "ada@example.test",
  phone: "+20-100-000-0000",
  taxId: "123-4567890",
};

describe("mizano.create_customer against the fake Mizano API", () => {
  it("sends the exact payload and the run's Idempotency-Key, then replays the same record for a repeated key", async () => {
    await fake.reset();
    const p = provider("mizano");
    const ctx = makeCtx(p, creds, { idempotencyKey: "fl_run1_create_customer" });

    const first = await runAction<{ id: string }>("mizano.create_customer", ctx, customer);
    expect(first).toEqual({ id: "cust_fake_1", ...customer });

    const req = await fake.lastRequest("mizano");
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/api/customers");
    expect(req.headers["idempotency-key"]).toBe("fl_run1_create_customer");
    expect(req.headers["x-auth-scheme"]).toBe("bearer");
    // Exact body: nothing else is sent to Mizano.
    expect(req.body).toEqual(customer);

    // Re-running the same run + node replays the stored record instead of inserting a second customer.
    const replay = await runAction<{ id: string }>("mizano.create_customer", ctx, customer);
    expect(replay).toEqual(first);
    expect((await fake.state<{ customers: unknown[] }>("mizano")).customers).toHaveLength(1);

    // A different run gets a different key and therefore a new record.
    const other = await runAction<{ id: string }>("mizano.create_customer", makeCtx(p, creds, { idempotencyKey: "fl_run2_create_customer" }), customer);
    expect(other.id).not.toBe(first.id);
    expect((await fake.state<{ customers: unknown[] }>("mizano")).customers).toHaveLength(2);
  });

  it("omits taxId when the input has none", async () => {
    await fake.reset();
    const { taxId: _omitted, ...withoutTaxId } = customer;
    await runAction("mizano.create_customer", makeCtx(provider("mizano"), creds, { idempotencyKey: "fl_run1_no_tax" }), withoutTaxId);
    expect((await fake.lastRequest("mizano")).body).toEqual(withoutTaxId);
  });
});

describe("mizano.create_draft_quote against the fake Mizano API", () => {
  it("sends the exact payload with the run's Idempotency-Key and inserts one quote", async () => {
    await fake.reset();
    const input = {
      customerId: "cust_fake_1",
      currency: "EGP",
      lines: [{ item: "Consulting", qty: "10.00", unitPrice: "500.00", taxRate: "15.00" }],
    };
    const ctx = makeCtx(provider("mizano"), creds, { idempotencyKey: "fl_run1_create_quote" });

    const out = await runAction<{ id: string; lines: unknown[] }>("mizano.create_draft_quote", ctx, input);
    expect(out.lines).toHaveLength(1);

    const req = await fake.lastRequest("mizano");
    expect(req.path).toBe("/api/quotes");
    expect(req.headers["idempotency-key"]).toBe("fl_run1_create_quote");
    expect(req.body).toEqual(input);

    const replay = await runAction<{ id: string }>("mizano.create_draft_quote", ctx, input);
    expect(replay.id).toBe(out.id);
    const state = await fake.state<{ quotes: { id: string; customerId: string }[] }>("mizano");
    expect(state.quotes).toHaveLength(1);
    expect(state.quotes[0].customerId).toBe("cust_fake_1");
  });
});
