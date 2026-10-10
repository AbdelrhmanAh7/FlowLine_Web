// Issue #124: a test-environment-only switch marks new e-mail sign-ups verified, so an automated sign-up -> sign-in ->
// create test runs end to end without reading the mail outbox. The switch is FLOWLINE_TEST_AUTO_VERIFY=1 (server env,
// for an external tester) or, per browser context, the fl_test_auto_verify=1 cookie (like fl_test_beta_mode); BOTH are
// ignored unless FLOWLINE_ENV=test. The verify stack runs FLOWLINE_ENV=test without the env switch, so these tests opt in
// with the cookie and also prove that, without any opt-in, sign-up still requires e-mail verification. That the switch
// cannot be turned on outside FLOWLINE_ENV=test (env or cookie) is proven in tests/unit/test-auto-verify.test.ts.
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const BASE_COOKIES = "fl_test_beta_mode=open; fl_locale=en";
/** Deterministic per stack: derived from a fixed seed and the stack URL, never from the clock. */
const emailFor = (base: string, seed: string) =>
  `army-124-${createHash("sha256").update(`${base}|${seed}`).digest("hex").slice(0, 12)}@flowline-e2e.test`;
const headers = (base: string, cookie: string) => ({ "content-type": "application/json", origin: new URL(base).origin, cookie });

test(
  "@issue-124 AC1: with the test auto-verify opt-in, a new sign-up is verified and can sign in and create a workspace",
  { tags: ["feat:fl-auth-api", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const email = emailFor(base, "api-auto-verified");
    const optIn = headers(base, `${BASE_COOKIES}; fl_test_auto_verify=1`);
    const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: optIn, body: JSON.stringify({ email, password: PASSWORD, name: "Army 124" }) });
    expect(up.status).toBe(200);
    expect(((await up.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);

    // Sign-in needs no verification link and no opt-in of its own: the account itself is verified.
    const signIn = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: headers(base, BASE_COOKIES), body: JSON.stringify({ email, password: PASSWORD }) });
    expect(signIn.status).toBe(200);
    const session = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers: headers(base, `${BASE_COOKIES}; ${session}`), body: JSON.stringify({ name: "Army 124 API" }) });
    expect(created.status).toBeLessThan(300);
  },
);

test(
  "@issue-124 AC2: without the opt-in, a new sign-up stays unverified and sign-in is refused until the e-mail link is used",
  { tags: ["feat:fl-auth-api", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const email = emailFor(base, "api-default-unverified");
    const plain = headers(base, BASE_COOKIES);
    // A value other than "1" is not an opt-in either.
    const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: headers(base, `${BASE_COOKIES}; fl_test_auto_verify=true`), body: JSON.stringify({ email, password: PASSWORD, name: "Army 124" }) });
    expect(up.status).toBe(200);
    expect(((await up.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(false);
    const signIn = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: plain, body: JSON.stringify({ email, password: PASSWORD }) });
    expect(signIn.status).toBe(403);
    expect(((await signIn.json()) as { code?: string }).code).toBe("EMAIL_NOT_VERIFIED");
  },
);

test(
  "@issue-124 AC1: in the browser, an auto-verified sign-up goes straight on to creating a workspace instead of waiting for an e-mail",
  { tags: ["feat:fl-sign-up", "feat:fl-sign-in", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    await browser.setCookies([
      { url: base, name: "fl_locale", value: "en" },
      { url: base, name: "fl_test_beta_mode", value: "open" },
      { url: base, name: "fl_test_auto_verify", value: "1" },
    ]);
    await app.open("/sign-up");
    await screen.getByLabel("Name").fill("Army 124");
    await screen.getByLabel("Email").fill(emailFor(base, "ui-auto-verified"));
    await screen.getByLabel("Password").fill(PASSWORD);
    await screen.getByRole("button", "Create account").tap();
    // Signed in on the spot: onboarding, not the "Check your inbox" panel (no e-mail was sent).
    await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
    await expect(screen.getByText("Check your inbox")).not.toBeVisible();
    await screen.getByLabel("Workspace name").fill("Army 124 UI");
    await screen.getByRole("button", "Continue").tap();
    await expect(screen.getByRole("heading", "What do you want to automate first?")).toBeVisible();
  },
);
