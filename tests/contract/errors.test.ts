import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeyCreds, expectProviderError, makeCtx, oauthCreds, provider, runAction, runVerify, startFake, type Fake } from "./helpers";

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("error mapping", () => {
  it("401 from the provider maps to kind auth", async () => {
    const github = provider("github");
    await expectProviderError(github.identity(makeCtx(github, { type: "api_key", token: "revoked-token" })), "auth");
  });

  it("expired Google token maps to kind auth", async () => {
    const sheets = provider("google_sheets");
    await expectProviderError(sheets.identity(makeCtx(sheets, { type: "oauth2", token: "expired-token" })), "auth");
  });

  it("429 with Retry-After maps to rate_limit with retryAfterMs", async () => {
    const slack = provider("slack");
    await fake.fault({ provider: "slack", pathPattern: "^/conversations\\.list$", mode: "429", times: 1, retryAfterSec: 2 });
    const err = await expectProviderError(runAction("slack.list_channels", makeCtx(slack, oauthCreds), {}), "rate_limit");
    expect(err.retryAfterMs).toBe(2000);
    expect(err.retryable).toBe(true);
    // The fault applied only once: the retry succeeds.
    await runAction("slack.list_channels", makeCtx(slack, oauthCreds), {});
  });

  it("500 maps to server", async () => {
    const github = provider("github");
    await fake.fault({ provider: "github", pathPattern: "^/user$", mode: "500", times: 1 });
    const err = await expectProviderError(github.identity(makeCtx(github, apiKeyCreds)), "server");
    expect(err.retryable).toBe(true);
  });
});

describe("lost responses on non-idempotent actions", () => {
  const input = { channel: "C001GEN", text: "did this send?" };

  it("drop_after_commit: outcome unknown, but verify shows the effect happened", async () => {
    const slack = provider("slack");
    const ctx = makeCtx(slack, oauthCreds);
    await fake.fault({ provider: "slack", pathPattern: "^/chat\\.postMessage$", mode: "drop_after_commit", times: 1 });
    const err = await runAction("slack.post_message", ctx, input).then(
      () => {
        throw new Error("expected the run to fail with a lost response");
      },
      (e: unknown) => e as import("@/integrations/types").ProviderError,
    );
    // A destroyed socket surfaces as response_lost (or, at worst, timeout) — both mean outcome unknown.
    expect(["response_lost", "timeout"]).toContain(err.kind);
    expect(err.outcomeUnknown).toBe(true);
    const v = await runVerify("slack.post_message", ctx, input);
    expect(v.happened).toBe(true);
  });

  it("drop_before_commit: outcome unknown, and verify shows the effect did NOT happen", async () => {
    const slack = provider("slack");
    const ctx = makeCtx(slack, oauthCreds);
    await fake.fault({ provider: "slack", pathPattern: "^/chat\\.postMessage$", mode: "drop_before_commit", times: 1 });
    const err = await expectProviderError(runAction("slack.post_message", ctx, input), "response_lost");
    expect(err.outcomeUnknown).toBe(true);
    const v = await runVerify("slack.post_message", ctx, input);
    expect(v.happened).toBe(false);
  });

  it("timeout: no response before the deadline, outcome unknown", async () => {
    const slack = provider("slack");
    const ctx = makeCtx(slack, oauthCreds, { signal: AbortSignal.timeout(1500) });
    await fake.fault({ provider: "slack", pathPattern: "^/chat\\.postMessage$", mode: "timeout", times: 1 });
    const err = await expectProviderError(runAction("slack.post_message", ctx, input), "timeout");
    expect(err.outcomeUnknown).toBe(true);
  });
});
