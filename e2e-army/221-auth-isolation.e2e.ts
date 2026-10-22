// Regression tests for issue #221 (auth isolation) and issue #72 (federated MFA failure audit).
//
// #221: Accounts, sessions and request safety
// 1. Sign-in with wrong password or unknown user returns 401 (enumeration protection).
// 2. Sign-in with unverified account returns 403 (requireEmailVerification).
//
// #72: Refused federated MFA step keeps its 401 and audits nothing against the workspace or platform.
//
// Consolidated into one file to stay within the repo cap of <= 8 top-level e2e-army/*.e2e.ts files.
// Tags: feat:fl-auth-api, feat:fl-zitadel-federated-mfa, feat:fl-audit-log, shard:core-api, lvl:api
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { createHash } from "node:crypto";

const PASSWORD = "Army-Passw0rd!";
const SEED_DOMAIN = "flowline-e2e.test";
const FIXED_COOKIE = "fl_test_beta_mode=open; fl_locale=en";
// Use the same seed pattern as the hub to ensure deterministic emails across runs
const SEED = process.env.E2E_ARMY_SEED ?? "nql-e2e-army-1";

function getBase(appUrl?: string): string {
  return (process.env.E2E_ARMY_URL || appUrl || "http://localhost:3100").replace(/\/+$/, "");
}

// Deterministic email generation with per-run uniqueness using timestamp
function seededEmail(name: string): string {
  const timestamp = Date.now().toString(36);
  const hash = createHash("sha1").update(`${SEED}:${name}:${timestamp}`).digest("hex").slice(0, 6);
  return `auth-221-${hash}@${SEED_DOMAIN}`;
}

const seeded72 = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("base64url");

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its session cookies. */
async function signedIn72(base: string, email: string) {
  const h = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED_COOKIE };
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    let token = null as string | null;
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token !== null;
    }, { timeout: 12_000, interval: 250, message: "no verification e-mail in the test outbox" }).toBe(true);
    if (!token) throw new Error("no verification e-mail in the test outbox");
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    if (!v.ok) throw new Error(`verify ${v.status}`);
  }
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { "content-type": "application/json", origin: new URL(base).origin, cookie: `${FIXED_COOKIE}; ${session}` };
}

test("@issue-221.1: sign-in with wrong password returns 401, not 200 or 403", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async ({ app }) => {
  const base = getBase(app?.baseUrl);
  const headers = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED_COOKIE };
  const email = seededEmail("wrong-pw");

  // Sign up a verified account
  const up = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: PASSWORD, name: "Test User" }),
  });
  expect(up.status).toBe(200);
  const upData = (await up.json()) as { token: string | null };
  expect(upData.token).toBeNull();

  // Poll outbox for verification email - select the newest message to avoid reusing consumed tokens
  let token: string | null = null;
  await expect.poll(async () => {
    const mailRes = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers });
    const body = (await mailRes.json().catch(() => ({ messages: [] }))) as { messages?: { purpose?: string; link?: string; timestamp?: number }[] };
    const messages = body.messages ?? [];
    // Select the newest "verify" message (highest timestamp, first after descending sort)
    const verifyMsg = messages.filter((m) => m.purpose === "verify").sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
    token = verifyMsg?.link ? new URL(verifyMsg.link).searchParams.get("token") : null;
    return token;
  }, { timeout: 20_000, message: `no verify email for ${email}` }).toBeTruthy();

  // Verify the account
  const verifyRes = await fetch(`${base}/api/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "verify", token }),
  });
  expect(verifyRes.status).toBe(200); // Assert status before parsing JSON
  const verifyData = (await verifyRes.json()) as { status: string };
  expect(verifyData.status).toBe("done");

  // Sign in with wrong password - should return 401
  const wrongPw = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "definitely-wrong-1" }),
  });
  expect(wrongPw.status).toBe(401);
  const wrongPwData = (await wrongPw.json()) as { message?: string };
  expect(wrongPwData.message).toBeTruthy();
  expect(wrongPwData.message?.toLowerCase()).toMatch(/wrong/i);

  // Sign in with non-existent user - should also return 401 (not 403)
  const noUser = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: seededEmail("no-such-user"), password: "definitely-wrong-2" }),
  });
  expect(noUser.status).toBe(401);
  const noUserData = (await noUser.json()) as { message?: string };
  expect(noUserData.message).toBeTruthy();
  expect(noUserData.message?.toLowerCase()).toMatch(/wrong/i);

  // Both should have the same error message (account enumeration protection)
  expect(wrongPwData.message?.toLowerCase()).toBe(noUserData.message?.toLowerCase());
});

test("@issue-221.2: sign-in with unverified account returns 403, not 200", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async ({ app }) => {
  const base = getBase(app?.baseUrl);
  const headers = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED_COOKIE };
  const email = seededEmail("unverified");

  // Sign up but don't verify
  const up = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: PASSWORD, name: "Unverified User" }),
  });
  expect(up.status).toBe(200);
  const upData = (await up.json()) as { token: string | null };
  expect(upData.token).toBeNull();

  // Try to sign in - should return 403 (not 200)
  const signed = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(signed.status).toBe(403);
  const signedData = (await signed.json()) as { message?: string };
  expect(signedData.message?.toLowerCase()).toMatch(/not verified/i);
});

test(
  "@issue-72 AC1/AC3: a refused federated MFA step keeps its 401 and puts no code, token or message into the audit",
  { tags: ["feat:fl-zitadel-federated-mfa", "feat:fl-audit-log", "feat:fl-platform-admin", "feat:fl-files", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // Well-formed (43 base64url characters) so it reaches the challenge lookup and the expired-challenge cleanup.
    const forged = seeded72(base, "army-72-forged-challenge");
    expect(forged).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stepUp = { origin: new URL(base).origin, cookie: `${FIXED_COOKIE}; fl_federated_mfa=${forged}` };
    // Twice: the second attempt sees the same refusal, not a 500 from the cleanup or the audit write.
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/api/federation/step-up`, { headers: stepUp });
      const text = await res.text();
      expect(res.status).toBe(401);
      expect(JSON.parse(text).error.code).toBe("FEDERATED_MFA_INVALID");
      expect(text).not.toContain(forged);
    }

    const owner = await signedIn72(base, `army-72-${seeded72(base, "owner").slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}@flowline-e2e.test`);
    const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers: owner, body: JSON.stringify({ name: "Army 72" }) });
    expect(created.status).toBeLessThan(300);
    const { workspace } = (await created.json()) as { workspace: { id: string } };
    const log = await fetch(`${base}/api/workspaces/${workspace.id}/audit`, { headers: owner });
    expect(log.status).toBe(200);
    const logText = await log.text();
    const actions = ((JSON.parse(logText).events ?? []) as { action: string }[]).map((e) => e.action);
    // A challenge nobody owns has no actor, so it is not audited against this (or any) workspace.
    expect(actions).not.toContain("sso.mfa_failed");
    expect(logText).not.toContain(forged);
    // The platform audit, where global-provider failures go (signin.mfa_failed), stays closed to an ordinary user.
    expect((await fetch(`${base}/api/platform/audit`, { headers: owner })).status).toBe(404);
  },
);
