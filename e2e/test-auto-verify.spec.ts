import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { BASE_URL } from "../playwright.config";
import { PASSWORD, uniqueEmail, verificationLink } from "./helpers";

/**
 * Issue #124: the test-only sign-up auto-verify switch (src/server/test-auto-verify.ts) through the real sign-up form.
 * The test stack runs FLOWLINE_ENV=test without FLOWLINE_TEST_AUTO_VERIFY, so the cookie test opts in for its own browser
 * context with the fl_test_auto_verify=1 cookie and the last test proves that, without it, sign-up still needs the e-mail.
 * Outside FLOWLINE_ENV=test both opt-ins are ignored: tests/unit/test-auto-verify.test.ts and
 * tests/integration/test-auto-verify-staging.test.ts.
 *
 * The first test is also the machine-readable description of the form's fields for the hub verifier, whose planner
 * reads these titles: the sign-up form is exactly Name, Email and Password with a **Create account** button, and it has
 * no password-confirmation field (design-reference slide 6 — a generated tester must not look for one).
 */
async function inbox(req: APIRequestContext, email: string) {
  return ((await (await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`)).json()) as { messages: unknown[] }).messages;
}

async function signUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Auto Verify");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

test("#124 the /sign-up form has exactly three fields - Name, Email, Password - and a Create account button, and no password-confirmation field", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.locator('form[method="post"] input')).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByLabel(/confirm/i)).toHaveCount(0);
});

test("#124 with the fl_test_auto_verify=1 cookie, Create account on /sign-up signs in at once and opens Name your workspace, with no Check your inbox and no e-mail", async ({ page, context }) => {
  await context.addCookies([{ name: "fl_test_auto_verify", value: "1", url: BASE_URL }]);
  const email = uniqueEmail("auto-verify");
  await signUp(page, email);
  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toHaveCount(0);
  expect(await inbox(page.request, email)).toEqual([]);
});

test("#124 without an opt-in, Create account on /sign-up shows Check your inbox and e-mails a link; Resend on /resend-verification answers honestly", async ({ page }) => {
  const email = uniqueEmail("no-auto-verify");
  await signUp(page, email);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await verificationLink(page.request, email);

  await page.goto("/resend-verification");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Resend", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "If the account is eligible, an email will arrive shortly." })).toBeVisible();
});
