// Mizano connection check (#145): the console's "Test connection" runs `runConnectionTest`, i.e. this provider's
// `identity()` = `GET /api/health` then `GET /api/me`, exercised against the fake provider server (real HTTP + the shared
// error classification), not a mocked http object. `testError` maps ProviderError.kind → a bounded code with fixed text.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_TIMEOUT_MS, runConnectionTest, testError } from "@/integrations/connection-test";
import { ProviderError, type Credentials } from "@/integrations/types";
import { HttpError } from "@/server/http";
import { expectProviderError, makeCtx, provider, startFake, type Fake } from "./helpers";

const p = provider("mizano");
/** A scoped key on a public https origin; the fake server (FLOWLINE_PROVIDER_OVERRIDE) is where the request really goes. */
const creds = (over: Partial<Credentials> = {}): Credentials => ({
  type: "api_key",
  token: "test-token",
  settings: { baseUrl: "https://mizano.example.com" },
  ...over,
});

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});
beforeEach(async () => {
  await fake.reset();
});

describe("mizano identity", () => {
  it("calls GET /api/health first, then GET /api/me, both with the scoped key as a Bearer", async () => {
    const id = await p.identity(makeCtx(p, creds()));
    expect(id).toEqual({ accountId: "mizano-ws-a", label: "Alice A Mizano" });
    const rs = await fake.requests("mizano");
    expect(rs.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /api/health", "GET /api/me"]);
    expect(rs.map((r) => r.headers["x-auth-scheme"])).toEqual(["bearer", "bearer"]);
  });

  it("reports a rejected key as an auth failure, never a raw provider message", async () => {
    const err = await expectProviderError(p.identity(makeCtx(p, creds({ token: "not-a-key" }))), "auth");
    expect(err.status).toBe(401);
  });

  it("refuses a base URL that is not a bare https origin before a request is sent", async () => {
    await expectProviderError(p.identity(makeCtx(p, creds({ settings: { baseUrl: "http://mizano.example.com" } }))), "client");
    expect(await fake.requests("mizano")).toEqual([]);
  });

  it("a failing health check stops before /api/me", async () => {
    await fake.fault({ provider: "mizano", pathPattern: "/api/health", mode: "500", times: 1 });
    await expectProviderError(p.identity(makeCtx(p, creds())), "server");
    expect((await fake.requests("mizano")).map((r) => r.path)).toEqual(["/api/health"]);
  });

  it.each([{ status: "degraded" }, {}, "<html>proxy</html>", null])("does not trust a 200 health response of %j, and never asks for /api/me", async (body) => {
    const ctx = makeCtx(p, creds());
    const paths: string[] = [];
    ctx.http = { request: async (req) => (paths.push(req.path), { status: 200, headers: new Headers(), data: body as never }) };
    await expectProviderError(p.identity(ctx), "server");
    expect(paths).toEqual(["/api/health"]);
  });
});

describe("runConnectionTest (what POST …/connections/{cid}/test returns)", () => {
  it("returns the account label for a good key", async () => {
    await expect(runConnectionTest(p, creds())).resolves.toBe("Alice A Mizano");
  });

  it("a wrong key is a 400 AUTHENTICATION_FAILED with fixed text", async () => {
    const err = await runConnectionTest(p, creds({ token: "not-a-key" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 400, code: "AUTHENTICATION_FAILED", message: "Invalid API key" });
  });

  it("an instance that does not answer within the deadline is a 502 PROVIDER_UNREACHABLE", async () => {
    await fake.fault({ provider: "mizano", pathPattern: "/api/health", mode: "timeout", times: 1 });
    const started = Date.now();
    const err = await runConnectionTest(p, creds(), 150).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: "PROVIDER_UNREACHABLE", message: "The provider could not be reached" });
    expect(Date.now() - started).toBeLessThan(TEST_TIMEOUT_MS);
  });

  it("a connection dropped by the instance is a 502 PROVIDER_UNREACHABLE", async () => {
    await fake.fault({ provider: "mizano", pathPattern: "/api/health", mode: "drop_before_commit", times: 1 });
    await expect(runConnectionTest(p, creds())).rejects.toMatchObject({ status: 502, code: "PROVIDER_UNREACHABLE" });
  });

  it("an unhealthy or failing instance is a 502 PROVIDER_ERROR; the provider text is not echoed", async () => {
    await fake.fault({ provider: "mizano", pathPattern: "/api/health", mode: "500", times: 1 });
    const err = await runConnectionTest(p, creds()).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: "PROVIDER_ERROR", message: "The provider returned an unexpected error" });
    expect(JSON.stringify(err)).not.toMatch(/internal fake error|provider failure/);
  });

  it("a private-network base URL is refused as 400 EGRESS_BLOCKED and never sent", async () => {
    await expect(runConnectionTest(p, creds({ settings: { baseUrl: "https://10.0.0.5" } }))).rejects.toMatchObject({ status: 400, code: "EGRESS_BLOCKED" });
    expect(await fake.requests("mizano")).toEqual([]);
  });
});

describe("testError mapping", () => {
  const cases: [ProviderError["kind"], number, string][] = [
    ["auth", 400, "AUTHENTICATION_FAILED"],
    ["egress_blocked", 400, "EGRESS_BLOCKED"],
    ["timeout", 502, "PROVIDER_UNREACHABLE"],
    ["network", 502, "PROVIDER_UNREACHABLE"],
    ["response_lost", 502, "PROVIDER_UNREACHABLE"],
    ["server", 502, "PROVIDER_ERROR"],
    ["rate_limit", 502, "PROVIDER_ERROR"],
    ["client", 502, "PROVIDER_ERROR"],
  ];
  it.each(cases)("%s → %i %s with fixed text, not the provider's message", (kind, status, code) => {
    const e = testError(new ProviderError(kind, "SECRET provider text 10.0.0.5"));
    expect(e).toMatchObject({ status, code });
    expect(e.message).not.toContain("SECRET");
  });
  it("an unknown error is a 502 PROVIDER_ERROR and an HttpError passes through", () => {
    expect(testError(new Error("boom 10.0.0.5"))).toMatchObject({ status: 502, code: "PROVIDER_ERROR", message: "The provider returned an unexpected error" });
    const h = new HttpError(403, "X", "y");
    expect(testError(h)).toBe(h);
  });
});
