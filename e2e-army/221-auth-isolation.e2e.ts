// Regression test for issue #221: Accounts, sessions and request safety
// Documents and verifies expected auth isolation behaviour:
// 1. Sign-in with wrong password or unknown user returns 401 (enumeration protection).
// 2. Sign-in with unverified account returns 403 (requireEmailVerification).
//
// Tags: feat:fl-auth-api, shard:core-api, lvl:api
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const SEED_DOMAIN = "flowline-e2e.test";
const FIXED_COOKIE = "fl_test_beta_mode=open; fl_locale=en";
// Use the same seed pattern as the hub to ensure deterministic emails across runs
const SEED = process.env.E2E_ARMY_SEED ?? "nql-e2e-army-1";

function getBase(appUrl?: string): string {
  return (process.env.E2E_ARMY_URL || appUrl || "http://localhost:3100").replace(/\/+$/, "");
}

// Deterministic email generation using the same pattern as the hub's lib.ts
function seededEmail(name: string): string {
  const hash = createHash("sha1").update(`${SEED}:${name}`).digest("hex").slice(0, 6);
  return `auth-221-${hash}@${SEED_DOMAIN}`;
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
    // Select the newest "verify" message (highest timestamp, or fallback to last element)
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
