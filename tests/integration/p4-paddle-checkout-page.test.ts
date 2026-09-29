/**
 * Phase 4 — our Paddle checkout page (/billing/checkout?ws=<slug>&_ptxn=txn_…), CX4-03.
 *
 * Paddle sends the buyer to the transaction's checkout.url (our page) with `_ptxn`; the page
 * loads Paddle.js with the public client-side token. These tests cover the page's server logic:
 * membership (404 for non-members), transaction validation, configuration states, the live-token
 * guard, the test-only Paddle.js override, and the success URL (never taken from the query).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PADDLE_JS_URL, paddleClientConfig, resolveCheckoutPage } from "@/billing/checkout-page";
import { getSetting } from "@/server/platform-settings";
import { createWorkspace } from "@/server/workspaces";
import { seedPlatformCredential, seedSetting, unseedPlatformCredential, unseedSetting } from "../fixtures/platform-seed";
import { addMember, closeDb, expectHttpError, makeUser, unique } from "./helpers";

// The billing provider and the Paddle client-side token are platform-panel records now (never env at runtime); the
// sandbox/live gates (FLOWLINE_BILLING_PADDLE_ENV, FLOWLINE_BILLING_ALLOW_LIVE) stay operator environment.
const KEYS = ["FLOWLINE_BILLING_PADDLE_ENV", "FLOWLINE_BILLING_ALLOW_LIVE", "FLOWLINE_TEST_PADDLE_JS_URL", "FLOWLINE_ENV"] as const;
const TOKEN = "test_0123456789abcdef0123456789a";
let saved: Record<string, string | undefined>;
let providerBefore: "stripe" | "paddle" | null = null;
beforeAll(async () => {
  providerBefore = (await getSetting("billing.provider"))?.value ?? null;
});
beforeEach(async () => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  await seedSetting("billing.provider", "paddle");
  await seedPlatformCredential("billing.paddle.sandbox", { publicId: TOKEN, secret: "pdl_sdbx_fake_billing" });
  process.env.FLOWLINE_BILLING_PADDLE_ENV = "sandbox";
  delete process.env.FLOWLINE_BILLING_ALLOW_LIVE;
  delete process.env.FLOWLINE_TEST_PADDLE_JS_URL;
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
afterAll(async () => {
  if (providerBefore) await seedSetting("billing.provider", providerBefore);
  else await unseedSetting("billing.provider");
  await closeDb();
});

const TXN = "txn_01h0j589qt1nee24210teqtz57";

async function ownedWorkspace() {
  const owner = await makeUser("chk-owner");
  const ws = await createWorkspace(owner, unique("Checkout Co"));
  return { owner, ws };
}

describe("checkout page: access", () => {
  it("renders the checkout for an owner, with the success URL built from the slug", async () => {
    const { owner, ws } = await ownedWorkspace();
    const state = await resolveCheckoutPage(owner, { ws: ws.slug, _ptxn: TXN });
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.transactionId).toBe(TXN);
    expect(state.token).toBe(TOKEN);
    expect(state.environment).toBe("sandbox");
    expect(state.scriptUrl).toBe(PADDLE_JS_URL);
    const base = (process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
    expect(state.successUrl).toBe(`${base}/w/${ws.slug}/settings?billing=success`);
    expect(state.settingsPath).toBe(`/w/${ws.slug}/settings?tab=plan`);
    // Only the public client-side token reaches the browser — never the API key or webhook secret.
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("pdl_");
  });

  it("404s for a non-member (existence not leaked) and for a malformed or missing slug", async () => {
    const { ws } = await ownedWorkspace();
    const stranger = await makeUser("chk-stranger");
    await expectHttpError(resolveCheckoutPage(stranger, { ws: ws.slug, _ptxn: TXN }), 404);
    await expectHttpError(resolveCheckoutPage(stranger, { ws: "no-such-workspace-xyz", _ptxn: TXN }), 404);
    await expectHttpError(resolveCheckoutPage(stranger, { ws: "../evil", _ptxn: TXN }), 404);
    await expectHttpError(resolveCheckoutPage(stranger, { _ptxn: TXN }), 404);
    await expectHttpError(resolveCheckoutPage(stranger, { ws: [ws.slug, ws.slug], _ptxn: TXN }), 404);
  });

  it("members without billing rights see an honest refusal, not the checkout", async () => {
    const { ws } = await ownedWorkspace();
    for (const role of ["viewer", "editor"] as const) {
      const member = await makeUser(`chk-${role}`);
      await addMember(ws.id, member.id, role);
      const state = await resolveCheckoutPage(member, { ws: ws.slug, _ptxn: TXN });
      expect(state.kind).toBe("forbidden");
      expect(state).not.toHaveProperty("token");
    }
  });
});

describe("checkout page: transaction id", () => {
  it("rejects a missing or malformed _ptxn", async () => {
    const { owner, ws } = await ownedWorkspace();
    for (const bad of [undefined, "", "txn_", "pri_123", "txn_abc<script>", "txn_abc&x=1", "txn_" + "a".repeat(80), ["txn_a", "txn_b"]]) {
      const state = await resolveCheckoutPage(owner, { ws: ws.slug, _ptxn: bad });
      expect(state.kind, String(bad)).toBe("invalid_transaction");
      expect(state).not.toHaveProperty("token");
    }
  });
});

describe("checkout page: configuration", () => {
  it("is 'not configured' without a client token or when the provider isn't Paddle", async () => {
    const { owner, ws } = await ownedWorkspace();
    await unseedPlatformCredential("billing.paddle.sandbox");
    expect((await resolveCheckoutPage(owner, { ws: ws.slug, _ptxn: TXN })).kind).toBe("not_configured");
    await seedPlatformCredential("billing.paddle.sandbox", { publicId: TOKEN, secret: "pdl_sdbx_fake_billing" });
    await seedSetting("billing.provider", "stripe");
    expect((await resolveCheckoutPage(owner, { ws: ws.slug, _ptxn: TXN })).kind).toBe("not_configured");
  });

  it("refuses a live client token unless ALLOW_LIVE=true and PADDLE_ENV=live (mirrors the API-key guard)", async () => {
    // The panel only ever stores a sandbox `test_…` client token; the live guard is still enforced on any token.
    const live = { provider: "paddle", token: "live_0123456789abcdef0123456789a" };
    expect(paddleClientConfig(live, { ...process.env })).toEqual({ ok: false, reason: "live_token_refused" });
    expect(paddleClientConfig(live, { ...process.env, FLOWLINE_BILLING_PADDLE_ENV: "live" })).toEqual({ ok: false, reason: "live_token_refused" });
    expect(paddleClientConfig(live, { ...process.env, FLOWLINE_BILLING_PADDLE_ENV: "sandbox", FLOWLINE_BILLING_ALLOW_LIVE: "true" })).toEqual({ ok: false, reason: "live_token_refused" });
    const ok = paddleClientConfig(live, { ...process.env, FLOWLINE_BILLING_PADDLE_ENV: "live", FLOWLINE_BILLING_ALLOW_LIVE: "true" });
    expect(ok.ok && ok.environment).toBe("live");
    // End to end through the page: the stored sandbox token is refused once the operator switches Paddle to live.
    const { owner, ws } = await ownedWorkspace();
    process.env.FLOWLINE_BILLING_PADDLE_ENV = "live";
    process.env.FLOWLINE_BILLING_ALLOW_LIVE = "true";
    expect((await resolveCheckoutPage(owner, { ws: ws.slug, _ptxn: TXN })).kind).toBe("token_env_mismatch");
  });

  it("rejects a sandbox token in live mode and a token that isn't a client-side token", () => {
    expect(paddleClientConfig({ provider: "paddle", token: TOKEN }, { ...process.env, FLOWLINE_BILLING_PADDLE_ENV: "live" })).toEqual({ ok: false, reason: "token_env_mismatch" });
    // An API key must never be handed to Paddle.js.
    expect(paddleClientConfig({ provider: "paddle", token: "pdl_sdbx_apikey_01abc" }, { ...process.env })).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("uses a stand-in Paddle.js only when FLOWLINE_ENV=test; production always loads Paddle's CDN", () => {
    const env = { ...process.env, FLOWLINE_TEST_PADDLE_JS_URL: "http://127.0.0.1:9/paddle/checkout/paddle.js" };
    const inTest = paddleClientConfig({ provider: "paddle", token: TOKEN }, { ...env, FLOWLINE_ENV: "test" });
    expect(inTest.ok && inTest.scriptUrl).toBe("http://127.0.0.1:9/paddle/checkout/paddle.js");
    for (const flEnv of ["production", "development", undefined]) {
      const cfg = paddleClientConfig({ provider: "paddle", token: TOKEN }, { ...env, FLOWLINE_ENV: flEnv });
      expect(cfg.ok && cfg.scriptUrl).toBe(PADDLE_JS_URL);
    }
  });
});
