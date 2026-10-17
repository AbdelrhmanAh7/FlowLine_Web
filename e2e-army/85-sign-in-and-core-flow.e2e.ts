// FlowLine critical flows in natural language (tester-army/e2e, issue #85): the landing page, Arabic RTL, sign-in and the
// core flow (a new blank flow on the canvas). Ported from the hub's suite (ops/verify/e2e-army/tests/FlowLine_Web.e2e.ts).
// The hub's verify job copies the top-level e2e-army/*.e2e.ts next to its own FlowLine suite, whose setup saves the
// `fl-user` session; `pnpm e2e:army` uses e2e-army/features/_setup.e2e.ts for the same. Copied files may import only `e2e`,
// `@e2e-dev/web` and node built-ins, so the helpers live here. Runs against the test stack (FLOWLINE_ENV=test: outbox e-mail).
//
// The issue #124 cases (test-only sign-up auto-verify) follow the #85 ones. They moved here from
// e2e-army/124-test-auto-verify-signup.e2e.ts to stay within the hub's cap of 8 top-level e2e-army/*.e2e.ts files: the
// verify job copies readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8) (nql-agents src/lib/e2earmy.ts), main
// already had 8, and tests/unit/e2e-army-tooling.test.ts asserts the repo stays at <= 8. Every #124 test, title and tag is
// kept as it was; they share this file's PASSWORD. Both groups exercise the sign-up and sign-in screens.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect, unique } from "e2e";

const PASSWORD = "Army-Passw0rd!";

/** Agent steps need a model; without one (E2E_ARMY_NOAGENT=1) they are skipped and the locator tests still run. */
const needsModel = () => test.skip(process.env.E2E_ARMY_NOAGENT === "1", "no model available: agent steps skipped");

/** A fresh verified account through the product's own endpoints (test stack), like e2e/helpers.ts signUpVerified. */
async function signUpVerified(base: string, email: string) {
  const origin = new URL(base).origin, h = { "content-type": "application/json", origin, cookie: "fl_test_beta_mode=open; fl_locale=en" };
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (!up.ok) throw new Error(`sign-up ${up.status}`);
  let token = null as string | null;
  // the outbox is written after the sign-up response: poll until the verify mail is there (bounded by the poll timeout, no fixed delay)
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

test("@issue-85 landing: the page shows the product promise and a call to action", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
  await app.open("/");
  await expect(screen.getByRole("heading", { level: 1 })).toContainText("Less repetitive work.");
  await expect(screen.getByRole("link", "Start free")).toBeVisible();
  await expect(screen.getByRole("link", "Sign in")).toBeVisible();
});

test("@issue-85 Arabic: the default language is Arabic and the page is right-to-left", { tags: ["feat:fl-i18n-rtl"] }, async ({ app, browser }) => {
  await app.open("/");
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
});

test("@issue-85 login: a verified user signs in with e-mail and password", { tags: ["feat:fl-sign-in"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const base = app.baseUrl!, email = `army-login-${Date.now().toString(36)}@flowline-e2e.test`;
  await signUpVerified(base, email);
  await browser.setCookies([{ url: base, name: "fl_locale", value: "en" }]);
  await app.open("/sign-in");
  await agent.act("sign in with the email {email} and the password {pw}", { params: { email: unique(email), pw: PASSWORD } });
  // A new user has no workspace yet, so a successful sign-in lands on onboarding.
  await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
});

test("@issue-85 login: a wrong password is rejected on the sign-in screen", { tags: ["feat:fl-sign-in"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
  await app.open("/sign-in");
  await expect(screen.getByLabel("Email")).toBeVisible();
  await agent.act("sign in with the email {email} and the password {pw}", { params: { email: "nobody@flowline-e2e.test", pw: "definitely-wrong-1" } });
  await agent.assert("an error tells the user that the e-mail or password is wrong, and the user is still on the sign-in screen");
  await expect(screen.getByLabel("Password")).toBeVisible();
});

test("@issue-85 core flow: a signed-in user creates a blank flow and its canvas opens", { session: "fl-user", tags: ["feat:fl-flows-list", "feat:fl-builder"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  await app.open("/app"); // continues in the session owner's workspace
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
  await agent.act("create a new blank flow and open its canvas");
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  await agent.assert("the flow builder canvas is shown and invites the user to start with a trigger");
});

// ---------------------------------------------------------------------------------------------------------------------
// Issue #124: a test-environment-only switch marks new e-mail sign-ups verified, so an automated sign-up -> sign-in ->
// create test runs end to end without reading the mail outbox. The switch is FLOWLINE_TEST_AUTO_VERIFY=1 (server env,
// for an external tester) or, per browser context, the fl_test_auto_verify=1 cookie (like fl_test_beta_mode); BOTH are
// ignored unless FLOWLINE_ENV=test. The verify stack runs FLOWLINE_ENV=test without the env switch, so these tests opt in
// with the cookie: set with the browser's cookie API or, in one test, by opening /api/test/auto-verify the way a browser
// that can only navigate (the hub verifier) must. They also prove that, without any opt-in, sign-up still requires
// e-mail verification. That the switch cannot be turned on outside FLOWLINE_ENV=test (env, cookie or route) is proven in
// tests/unit/test-auto-verify.test.ts and tests/unit/test-auto-verify-route.test.ts.

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
  "@issue-124 AC1: a browser that can only navigate opts in by opening /api/test/auto-verify on the FLOWLINE_ENV=test stack, and Create account then opens Name your workspace",
  { tags: ["feat:fl-sign-up", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    // No fl_test_auto_verify cookie from the test itself: opening the route must set it, as for the hub verifier, whose
    // browser can only navigate, fill and click. The locale and beta-mode cookies stand in for that verifier's own setup.
    await browser.setCookies([
      { url: base, name: "fl_locale", value: "en" },
      { url: base, name: "fl_test_beta_mode", value: "open" },
    ]);
    const email = await freshEmail(base, "ui-navigate-opt-in");
    await app.open("/api/test/auto-verify");
    await expect(browser).toHaveURL(/\/sign-up$/);
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
  "@issue-124 AC1: the /sign-up form has exactly Name, Email and Password fields and a Create account button - no password-confirmation field",
  { tags: ["feat:fl-sign-up", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    await browser.setCookies([
      { url: base, name: "fl_locale", value: "en" },
      { url: base, name: "fl_test_beta_mode", value: "open" },
    ]);
    await app.open("/sign-up");
    await screen.getByLabel("Name").waitFor();
    await screen.getByLabel("Email").waitFor();
    await screen.getByLabel("Password").waitFor();
    await screen.getByRole("button", "Create account").waitFor();
    // The form is Name + Email + Password only (design-reference slide 6); a generated tester must not expect a
    // password-confirmation field.
    const count = await browser.evaluate(() => document.querySelectorAll('form[method="post"] input').length);
    expect(count).toBe(3);
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
    await untilAuthFormHydrated(browser);
    await screen.getByLabel("Email").fill(email);
    await screen.getByRole("button", "Resend").tap();
    await expect(screen.getByText("If the account is eligible, an email will arrive shortly.")).toBeVisible();
  },
);
