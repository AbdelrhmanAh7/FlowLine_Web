import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFake, type Fake } from "./helpers";

// The fake provider server's mizano handler (#222 health probe, extended by #145): GET /api/health, /api/me and
// /api/invoices behind the server's generic Bearer auth.
let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

const get = (path: string, token?: string) =>
  fetch(`${fake.url}/mizano${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("fake mizano GET /api/health", () => {
  it.each(["test-token", "second-account-token"])("returns 200 { status: 'ok', version: 'fake' } on every call with %s", async (token) => {
    for (let i = 0; i < 12; i++) {
      const res = await get("/api/health", token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", version: "fake" });
    }
  });

  it("answers a missing or unknown token with the generic 401 { message: 'Unauthorized' }", async () => {
    for (const path of ["/api/health", "/api/me"]) {
      for (const token of [undefined, "not-a-real-token"]) {
        const res = await get(path, token);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ message: "Unauthorized" });
      }
    }
  });
});

describe("fake mizano identity and invoices (#145)", () => {
  it("names the workspace bound to the scoped key on GET /api/me", async () => {
    const a = await get("/api/me", "test-token");
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ id: "mizano-ws-a", workspaceName: "Alice A Mizano" });
    const b = await get("/api/me", "second-account-token");
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual({ id: "mizano-ws-b", workspaceName: "Bob B Mizano" });
  });

  it("returns one overdue invoice on GET /api/invoices", async () => {
    const res = await get("/api/invoices?status=overdue", "test-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      currency: "EGP",
      invoices: [{ number: "INV-9001", customerName: "Cedar Studio", balanceDue: "1200.00", dueDate: "2026-09-10" }],
    });
  });

  it("returns 404 { message: 'Not found' } for any other path or method", async () => {
    for (const res of [
      await get("/api/health/other", "test-token"),
      await get("/api/unknown", "test-token"),
      await fetch(`${fake.url}/mizano/api/health`, { method: "POST", headers: { authorization: "Bearer test-token" } }),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: "Not found" });
    }
  });
});
