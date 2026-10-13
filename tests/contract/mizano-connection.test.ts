// Mizano connection check (#145): the console's "Test connection" runs this provider's `identity()`, so the adapter is
// exercised against the fake provider server (real HTTP + the shared error classification), not a mocked http object.
// The route maps ProviderError.kind → a bounded code: auth → 400 AUTHENTICATION_FAILED, client/egress → 400, else 502.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Credentials } from "@/integrations/types";
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

describe("mizano identity", () => {
  it("returns the workspace from /api/me with the scoped key sent as a Bearer", async () => {
    const id = await p.identity(makeCtx(p, creds()));
    expect(id).toEqual({ accountId: "mizano-ws-a", label: "Alice A Mizano" });
    const r = await fake.lastRequest("mizano");
    expect(r.path).toBe("/api/me");
    expect(r.headers["x-auth-scheme"]).toBe("bearer");
  });

  it("reports a rejected key as an auth failure, never a raw provider message", async () => {
    const err = await expectProviderError(p.identity(makeCtx(p, creds({ token: "not-a-key" }))), "auth");
    expect(err.status).toBe(401);
  });

  it("refuses a base URL that is not a bare https origin before a request is sent", async () => {
    await expectProviderError(p.identity(makeCtx(p, creds({ settings: { baseUrl: "http://mizano.example.com" } }))), "client");
  });
});
