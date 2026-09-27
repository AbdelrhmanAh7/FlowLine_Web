import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectProviderError, makeCtx, oauthCreds, provider, queryOf, runAction, runVerify, startFake, type Fake } from "./helpers";

const p = provider("slack");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("slack identity", () => {
  it("POSTs auth.test and returns team:user", async () => {
    const id = await p.identity(makeCtx(p, oauthCreds));
    expect(id).toEqual({ accountId: "T001FLOW:U001ALICE", label: "alice @ Flowline" });
    const r = await fake.lastRequest("slack");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/auth.test");
  });

  it("maps ok:false token_revoked (HTTP 200) to an auth error", async () => {
    await expectProviderError(p.identity(makeCtx(p, { type: "oauth2", token: "revoked-token" })), "auth");
  });
});

describe("slack.post_message", () => {
  it("posts with idempotency metadata, and verify finds it via conversations.history", async () => {
    const ctx = makeCtx(p, oauthCreds);
    const input = { channel: "C001GEN", text: "Invoice INV-001 approved" };
    const out = await runAction<{ ts: string; channel: string }>("slack.post_message", ctx, input);
    expect(out.channel).toBe("C001GEN");
    expect(out.ts).toBeTruthy();

    const r = await fake.lastRequest("slack");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/chat.postMessage");
    const body = r.body as { channel: string; text: string; metadata: { event_type: string; event_payload: { idempotency_key: string } } };
    expect(body.metadata).toEqual({ event_type: "flowline_action", event_payload: { idempotency_key: ctx.idempotencyKey } });

    const v = await runVerify<{ ts: string; channel: string }>("slack.post_message", ctx, input);
    expect(v.happened).toBe(true);
    expect(v.output?.ts).toBe(out.ts);
    const vr = await fake.lastRequest("slack");
    expect(vr.path).toBe("/conversations.history");
    expect(queryOf(vr).get("include_all_metadata")).toBe("true");
    expect(queryOf(vr).get("channel")).toBe("C001GEN");
  });

  it("verify reports happened:false when no message carries the key", async () => {
    const ctx = makeCtx(p, oauthCreds);
    const v = await runVerify("slack.post_message", ctx, { channel: "C001GEN", text: "never sent" });
    expect(v.happened).toBe(false);
  });
});

describe("slack.list_channels", () => {
  it("lists seeded channels", async () => {
    const out = await runAction<{ channels: { id: string; name: string }[] }>("slack.list_channels", makeCtx(p, oauthCreds), {});
    expect(out.channels.map((c) => c.name)).toEqual(["general", "random"]);
    const r = await fake.lastRequest("slack");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/conversations.list");
    expect(queryOf(r).get("limit")).toBe("100");
  });
});
