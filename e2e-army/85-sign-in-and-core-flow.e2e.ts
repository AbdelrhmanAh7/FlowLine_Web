// FlowLine critical flows in natural language (tester-army/e2e, issue #85): the landing page, Arabic RTL, sign-in and the
// core flow (a new blank flow on the canvas). Ported from the hub's suite (ops/verify/e2e-army/tests/FlowLine_Web.e2e.ts).
// The hub's verify job copies the top-level e2e-army/*.e2e.ts next to its own FlowLine suite, whose setup saves the
// `fl-user` session; `pnpm e2e:army` uses e2e-army/features/_setup.e2e.ts for the same. Copied files may import only `e2e`,
// `@e2e-dev/web` and node built-ins, so the helpers live here. Runs against the test stack (FLOWLINE_ENV=test: outbox e-mail).
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
  let token: string | null = null;
  for (let i = 0; i < 24 && !token; i++) {
    const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
    const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
    const link = messages.find((m) => m.purpose === "verify")?.link;
    token = link ? new URL(link).searchParams.get("token") : null;
    if (!token) await new Promise((r) => setTimeout(r, 500)); // the outbox is written after the sign-up response
  }
  if (!token) throw new Error("no verification e-mail in the test outbox");
  const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
  if (!v.ok) throw new Error(`verify ${v.status}`);
}

test("@issue-85 landing: the page shows the product promise and a call to action", { tags: ["feat:fl-landing"] }, async ({ app, screen }) => {
  await app.open("/");
  await expect(screen.getByRole("heading").first()).toBeVisible();
  await expect(screen.getByRole("link").first()).toBeVisible();
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
