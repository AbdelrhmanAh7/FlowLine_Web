// Regression test for issue #221: Accounts, sessions and request safety failing on main
// The hub's fl-auth-api tests fail when the same account/credentials are reused across shard runs.
// This test ensures that each test runs with isolated credentials and that auth endpoints
// properly reject invalid credentials with 401 (not 200/403 mismatches).
//
// Tags: feat:fl-auth-api, lvl:api (no model needed for API-level tests)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase, seededEmail } from "../ops/verify/e2e-army/tests/lib";

const PASSWORD = "Army-Passw0rd!";
const SEED_DOMAIN = "flowline-e2e.test";

test("[issue-221.1] sign-in with wrong password returns 401, not 200 or 403", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const h = { "content-type": "application/json", origin: apiBase() };
  const email = seededEmail("auth-221-wrong-pw", SEED_DOMAIN);

  // Sign up a verified account first
  const up = await fetch(`${apiBase()}/api/auth/sign-up/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email, password: PASSWORD, name: "Test User" }),
  });
  expect(up.status).toBe(200);
  expect(up.json.token).toBeNull();

  // Verify the account
  const mail = await fetch(`${apiBase()}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
  const messages: { purpose?: string; link?: string }[] = (await mail.json().catch(() => ({ messages: [] }))).messages ?? [];
  const link = messages.find((m) => m.purpose === "verify")?.link;
  expect(link, "verification email should exist").toBeTruthy();
  const token = new URL(link!).searchParams.get("token");
  expect(token, "verification token should exist").toBeTruthy();
  await fetch(`${apiBase()}/api/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ action: "verify", token }),
  });

  // Sign in with wrong password - should return 401
  const wrongPw = await fetch(`${apiBase()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email, password: "definitely-wrong-1" }),
  });
  expect(wrongPw.status).toBe(401);
  expect(wrongPw.json.message).toBeTruthy();
  expect(wrongPw.json.message.toLowerCase()).toMatch(/wrong/i);

  // Sign in with non-existent user - should also return 401 (not 403)
  const noUser = await fetch(`${apiBase()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email: seededEmail("no-such-user-221", SEED_DOMAIN), password: "definitely-wrong-2" }),
  });
  expect(noUser.status).toBe(401);
  expect(noUser.json.message).toBeTruthy();
  expect(noUser.json.message.toLowerCase()).toMatch(/wrong/i);

  // Both should have the same error message (account enumeration protection)
  expect(wrongPw.json.message.toLowerCase()).toBe(noUser.json.message.toLowerCase());
});

test("[issue-221.2] sign-in with unverified account returns 403, not 200", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const h = { "content-type": "application/json", origin: apiBase() };
  const email = seededEmail("auth-221-unverified", SEED_DOMAIN);

  // Sign up but don't verify
  const up = await fetch(`${apiBase()}/api/auth/sign-up/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email, password: PASSWORD, name: "Unverified User" }),
  });
  expect(up.status).toBe(200);
  expect(up.json.token).toBeNull();

  // Try to sign in - should return 403 (not 200)
  const signed = await fetch(`${apiBase()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(signed.status).toBe(403);
  expect(signed.json.message.toLowerCase()).toMatch(/not verified/i);
});
