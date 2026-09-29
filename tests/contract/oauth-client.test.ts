import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProvider } from "@/integrations/registry";
import { tokenRequest } from "@/server/oauth-client";
import { startFake, type Fake } from "./helpers";

/**
 * CXH-14: token endpoint failures are classified by cause. Rate limits, 5xx and network failures are TRANSIENT (keep
 * the user's grant, honour Retry-After); only recognized permanent grant failures are "grant" (which expires a
 * connection); client-auth refusals stay the app's problem; anything else is an unrecognized failure that never expires.
 */
let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
  await fake.reset();
});
afterAll(async () => {
  await fake.close();
});

const provider = () => getProvider("google_sheets")!;
const refresh = () => tokenRequest(provider(), { clientId: "fake-client", secret: "fake-secret" }, { grant_type: "refresh_token", refresh_token: "whatever" });

describe("tokenRequest failure classification", () => {
  it("HTTP 429 is transient and carries Retry-After (seconds)", async () => {
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "429", retryAfterSec: 12 });
    expect(await refresh()).toMatchObject({ ok: false, kind: "transient", retryAfterMs: 12_000 });
  });

  it("HTTP 5xx and a dropped connection are transient", async () => {
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "500" });
    expect(await refresh()).toMatchObject({ ok: false, kind: "transient" });
    await fake.fault({ provider: "google_sheets", pathPattern: "^/oauth/token$", mode: "drop_before_commit" });
    expect(await refresh()).toMatchObject({ ok: false, kind: "transient" });
  });

  it("RFC 6749 transient error codes are transient even with a 400", async () => {
    for (const code of ["temporarily_unavailable", "server_error", "slow_down", "rate_limited"]) {
      await fake.oauthError("google_sheets", code, "try later");
      expect(await refresh(), code).toMatchObject({ ok: false, kind: "transient" });
    }
  });

  it("recognized permanent grant failures are 'grant'; unknown 4xx errors are not", async () => {
    for (const code of ["invalid_grant", "invalid_refresh_token", "token_revoked", "bad_refresh_token"]) {
      await fake.oauthError("google_sheets", code, "nope");
      expect(await refresh(), code).toMatchObject({ ok: false, kind: "grant" });
    }
    await fake.oauthError("google_sheets", "something_new", "nope");
    expect(await refresh()).toMatchObject({ ok: false, kind: "unavailable", code: "provider_error" });
  });

  it("client-auth refusals stay client_auth", async () => {
    await fake.oauthClient("google_sheets", "fake-client", ["only-this-secret"]);
    try {
      expect(await refresh()).toMatchObject({ ok: false, kind: "client_auth" });
    } finally {
      await fake.oauthClient("google_sheets", "fake-client", []);
    }
  });
});
