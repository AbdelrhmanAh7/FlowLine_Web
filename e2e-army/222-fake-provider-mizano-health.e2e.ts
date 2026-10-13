// Issue #222: mizano handler for GET /api/health in the fake provider server (part of #145).
// Request-level (no model): the fake server plays the Mizano host for the test stack, so the auth
// contract, the health response and the rate limit are proven through the app's own fetch.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const HEALTH = "/mizano/api/health";

test(
  "@issue-222 AC1: GET /api/health with the seeded token returns 200 { status: 'ok', version: 'fake' }",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app }) => {
    const res = await app.fetch(HEALTH, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "fake" });
  },
);

test(
  "@issue-222 AC2: GET /api/health without a valid token returns 401 { message: 'Unauthorized' }",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app }) => {
    // No token at all.
    const missing = await app.fetch(HEALTH, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ message: "Unauthorized" });

    // An unknown token takes the same path through authFail — the handler re-checks the Bearer token
    // itself, so the health endpoint is never reachable without a valid one.
    const unknown = await app.fetch(HEALTH, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-a-real-token",
      },
    });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ message: "Unauthorized" });
  },
);

test(
  "@issue-222 AC3: GET /api/health rate-limits a runaway client: 10 requests per 60 s per account, then 429",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app }) => {
    // second-account-token (account b) keeps this window independent of the other tests' account-a traffic.
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer second-account-token",
    };
    for (let i = 0; i < 10; i++) {
      const res = await app.fetch(HEALTH, { method: "GET", headers });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", version: "fake" });
    }
    const limited = await app.fetch(HEALTH, { method: "GET", headers });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate limited" });
  },
);

test(
  "@issue-222 AC4: any other mizano path returns 404 { message: 'Not found' }",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app }) => {
    const res = await app.fetch("/mizano/api/health/other", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "Not found" });
  },
);
