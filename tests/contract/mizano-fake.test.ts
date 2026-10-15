import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFake, type Fake } from "./helpers";

// The fake provider server's mizano handler (#147, #222): GET /api/health and GET /api/me behind the server's generic
// Bearer auth, plus the two create steps (POST /api/customers, POST /api/quotes) that dedupe on Idempotency-Key.
let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

const get = (path: string, token?: string) =>
  fetch(`${fake.url}/mizano${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

const post = (path: string, body: unknown, key?: string, token = "test-token") =>
  fetch(`${fake.url}/mizano${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(body),
  });

describe("fake mizano GET /api/health", () => {
  it.each(["test-token", "second-account-token"])("returns 200 { status: 'ok', version: 'fake' } on every call with %s", async (token) => {
    for (let i = 0; i < 12; i++) {
      const res = await get("/api/health", token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", version: "fake" });
    }
  });

  it("answers a missing or unknown token with the generic 401 { message: 'Unauthorized' }", async () => {
    for (const path of ["/api/health", "/api/me", "/api/customers"]) {
      for (const token of [undefined, "not-a-real-token"]) {
        const res = token ? await get(path, token) : await fetch(`${fake.url}/mizano${path}`);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ message: "Unauthorized" });
      }
    }
  });

  it("returns 404 { message: 'Not found' } for any other path or method", async () => {
    for (const res of [
      await get("/api/health/other", "test-token"),
      await get("/api/invoices", "test-token"),
      await fetch(`${fake.url}/mizano/api/health`, { method: "POST", headers: { authorization: "Bearer test-token" } }),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: "Not found" });
    }
  });
});

describe("fake mizano GET /api/me", () => {
  it("returns the workspace identity the adapter parses", async () => {
    const res = await get("/api/me", "test-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "mz-ws-fake", workspaceName: "Fake Mizano Workspace" });
  });
});

describe("fake mizano create steps", () => {
  const customer = { name: "Army Customer", company: "Army Ltd", email: "army@example.test", phone: "+20-100-000-0000" };
  const quote = { customerId: "cust_fake_1", currency: "EGP", lines: [{ item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" }] };

  it("creates a customer once per Idempotency-Key and replays the same record for a repeated key", async () => {
    await fake.reset();
    const first = await post("/api/customers", customer, "fl_run1_node1");
    expect(first.status).toBe(201);
    const created = await first.json();
    expect(created).toMatchObject(customer);

    const replay = await post("/api/customers", customer, "fl_run1_node1");
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(created);

    const otherRun = await post("/api/customers", customer, "fl_run2_node1");
    expect((await otherRun.json()).id).not.toBe(created.id);

    const { customers } = await fake.state<{ customers: unknown[] }>("mizano");
    expect(customers).toHaveLength(2);
  });

  it("creates a quote once per Idempotency-Key and replays the same record for a repeated key", async () => {
    await fake.reset();
    const first = await post("/api/quotes", quote, "fl_run1_node2");
    expect(first.status).toBe(201);
    const created = await first.json();
    expect(created).toMatchObject(quote);

    const replay = await post("/api/quotes", quote, "fl_run1_node2");
    expect(await replay.json()).toEqual(created);

    const { quotes } = await fake.state<{ quotes: unknown[] }>("mizano");
    expect(quotes).toHaveLength(1);
  });

  it("refuses a create without an Idempotency-Key instead of inserting", async () => {
    await fake.reset();
    const res = await post("/api/customers", customer);
    expect(res.status).toBe(400);
    expect((await fake.state<{ customers: unknown[] }>("mizano")).customers).toHaveLength(0);
  });
});
