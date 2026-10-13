// Issue #124: a test-environment-only switch marks new e-mail sign-ups verified, so an automated sign-up -> sign-in ->
// create test runs end to end without reading the mail outbox. The switch is FLOWLINE_TEST_AUTO_VERIFY=1 (server env,
// for an external tester) or, per browser context, the fl_test_auto_verify=1 cookie (like fl_test_beta_mode); BOTH are
// ignored unless FLOWLINE_ENV=test. The verify stack runs FLOWLINE_ENV=test without the env switch, so these tests opt in
// with the cookie (set directly, or by opening /api/test/auto-verify as a navigate-only tester does) and also prove that, without any opt-in, sign-up still requires e-mail verification. That the switch
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
/**
 * The first address in the seed's fixed sequence that has no account yet, so a rerun against the same stack and database
 * (a retried verification) signs up a new user instead of getting Better Auth's generic duplicate-sign-up answer.
 * Sign-in with the test password is the probe: 401 only for an unknown address (a taken one answers 200 or 403).
 */
async function freshEmail(base: string, seed: string): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const email = emailFor(base, `${seed}#${n}`);
    const probe = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: headers(base, BASE_COOKIES), body: JSON.stringify({ email, password: PASSWORD }) });
    if (probe.status === 401) return email;
    if (probe.status !== 200 && probe.status !== 403) throw new Error(`sign-in probe for ${email} answered ${probe.status}`);
  }
  throw new Error(`no unused address left for seed ${seed}`);
}
/**
 * A submit before React hydrates is a plain form POST that signs nobody up or in, so a fast tap could time out waiting for
 * the next screen. Wait until React has attached its handlers to the auth form (no clock, no sleep: polled DOM state).
 */
const untilAuthFormHydrated = (browser: { evaluate<T>(fn: () => T): Promise<T> }) =>
  expect
    .poll(() => browser.evaluate(() => Object.keys(document.querySelector('form[method="post"]') ?? {}).some((k) => k.startsWith("__reactProps$"))))
    .toBe(true);

test(
  "@issue-124 AC1: with the test auto-verify opt-in, a new sign-up is verified and can sign in and create a workspace",
  { tags: ["feat:fl-auth-api", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const email = await freshEmail(base, "api-auto-verified");
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
    const email = await freshEmail(base, "api-default-unverified");
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
    const email = await freshEmail(base, "ui-auto-verified");
    await app.open("/sign-up");
    await untilAuthFormHydrated(browser);
    await screen.getByLabel("Name").fill("Army 124");
    await screen.getByLabel("Email").fill(email);
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

test(
  "@issue-124 AC1: a browser that can only navigate opts in by opening /api/test/auto-verify, then Create account on /sign-up opens Name your workspace with no Check your inbox",
  { tags: ["feat:fl-sign-up", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    // Only the beta and locale cookies: the auto-verify opt-in comes from the page visit, as for a tester that cannot set cookies.
    await browser.setCookies([
      { url: base, name: "fl_locale", value: "en" },
      { url: base, name: "fl_test_beta_mode", value: "open" },
    ]);
    const email = await freshEmail(base, "ui-auto-verify-by-url");
    await app.open("/api/test/auto-verify");
    await expect(screen.getByRole("button", "Create account")).toBeVisible();
    await untilAuthFormHydrated(browser);
    await screen.getByLabel("Name").fill("Army 124");
    await screen.getByLabel("Email").fill(email);
    await screen.getByLabel("Password").fill(PASSWORD);
    await screen.getByRole("button", "Create account").tap();
    await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
    await expect(screen.getByText("Check your inbox")).not.toBeVisible();
  },
);

test(
  "@issue-124 AC1: GET /api/test/auto-verify sets the fl_test_auto_verify=1 cookie and sends the browser to /sign-up",
  { tags: ["feat:fl-auth-api", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const res = await fetch(`${base}/api/test/auto-verify`, { redirect: "manual", headers: headers(base, BASE_COOKIES) });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!, base).pathname).toBe("/sign-up");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("fl_test_auto_verify=1;"))).toBe(true);
  },
);

test(
  "@issue-124 AC1: in the browser, an auto-verified account signs in on the sign-in form with the credentials it signed up with",
  { tags: ["feat:fl-sign-in", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const email = await freshEmail(base, "ui-sign-in-after-auto-verify");
    const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: headers(base, `${BASE_COOKIES}; fl_test_auto_verify=1`), body: JSON.stringify({ email, password: PASSWORD, name: "Army 124" }) });
    expect(up.status).toBe(200);
    // Signing in needs no opt-in: the account itself was created verified.
    await browser.setCookies([
      { url: base, name: "fl_locale", value: "en" },
      { url: base, name: "fl_test_beta_mode", value: "open" },
    ]);
    await app.open("/sign-in");
    await untilAuthFormHydrated(browser);
    await screen.getByLabel("Email").fill(email);
    await screen.getByLabel("Password").fill(PASSWORD);
    await screen.getByRole("button", "Sign in").tap();
    // A new account has no workspace yet, so /app sends it on to onboarding; no "not verified" error on the way.
    await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
    await expect(screen.getByText("Verify your email first — open the link we sent you.")).not.toBeVisible();
  },
);

test(
  "@issue-124 AC2: in the browser, without an opt-in Create account on /sign-up shows Check your inbox and e-mails a link, and Resend on /resend-verification answers with its honest status line",
  { tags: ["feat:fl-sign-up", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    await browser.setCookies([
      { url: base, name: "fl_locale", value: "en" },
      { url: base, name: "fl_test_beta_mode", value: "open" },
    ]);
    const email = await freshEmail(base, "ui-default-check-inbox");
    await app.open("/sign-up");
    await untilAuthFormHydrated(browser);
    await screen.getByLabel("Name").fill("Army 124");
    await screen.getByLabel("Email").fill(email);
    await screen.getByLabel("Password").fill(PASSWORD);
    await screen.getByRole("button", "Create account").tap();
    await expect(screen.getByRole("heading", "Check your inbox")).toBeVisible();
    // Delivery may finish just after the response (src/server/email/flows.ts), so poll the test outbox for the link.
    const verifyLinkSent = async () => {
      const res = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: headers(base, BASE_COOKIES) });
      return ((await res.json()) as { messages: { link: string | null }[] }).messages.some((m) => m.link?.includes("/verify-email?token="));
    };
    await expect.poll(verifyLinkSent).toBe(true);

    // The page never says whether the address has an account (no "Verification resent"): its one success line is generic.
    await app.open("/resend-verification");
    await screen.getByLabel("Email").fill(email);
    await screen.getByRole("button", "Resend").tap();
    await expect(screen.getByText("If the account is eligible, an email will arrive shortly.")).toBeVisible();
  },
);
