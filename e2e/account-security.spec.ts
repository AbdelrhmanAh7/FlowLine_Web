import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { BASE_URL } from "../playwright.config";
import { PASSWORD, setupUser } from "./helpers";
import { base32Decode, totpCodeFor } from "./tools/totp";

// Ensure screenshot directories exist
mkdirSync("artifacts/phase-4/issue-196", { recursive: true });
mkdirSync("artifacts/phase-4/issue-319", { recursive: true });

test("user menu opens the security page and shows the two-step status", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
  await page.getByRole("menuitem", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/phase-4/issue-196/account-security-en-ltr.png" });
  await page.screenshot({ path: "artifacts/phase-4/issue-319/account-security-en-ltr.png" });

  // Turn MFA on through the API (the UI flow is a later part), then the page reads On.
  const enable = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD } });
  expect(enable.ok()).toBeTruthy();
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret");
  expect(secret).toBeTruthy();
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCodeFor(base32Decode(secret!)) } });
  expect(verify.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("main").getByText("On", { exact: true })).toBeVisible();
});

test("the security page renders in Arabic with RTL layout", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.context().addCookies([
    { name: "fl_locale", value: "ar", domain: "localhost", path: "/" },
  ]);
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary").getByRole("button", { name: /E2E User/ }).click();
  await page.screenshot({ path: "artifacts/phase-4/issue-196/user-menu-ar-rtl.png" });
  await page.screenshot({ path: "artifacts/phase-4/issue-319/user-menu-ar-rtl.png" });

  await page.goto("/account/security");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "الأمان" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "التحقق بخطوتين" })).toBeVisible();
  await expect(page.getByRole("main").getByText("غير مفعّل", { exact: true })).toBeVisible();

  // Verify RTL layout geometry: row starts on the right (h2) and badge is placed to the left (inline-end)
  const isRtlLayout = await page.evaluate(() => {
    const h2 = document.querySelector("main h2")!;
    const badge = h2.nextElementSibling!;
    return badge.getBoundingClientRect().right <= h2.getBoundingClientRect().left;
  });
  expect(isRtlLayout).toBe(true);
  await page.screenshot({ path: "artifacts/phase-4/issue-196/account-security-ar-rtl.png" });
  await page.screenshot({ path: "artifacts/phase-4/issue-319/account-security-ar-rtl.png" });

  // Turn MFA on through API and verify descriptive active Arabic badge
  const enable = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD } });
  expect(enable.ok()).toBeTruthy();
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret");
  expect(secret).toBeTruthy();
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCodeFor(base32Decode(secret!)) } });
  expect(verify.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("main").getByText("مفعّل (نشط)", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/phase-4/issue-196/account-security-ar-on.png" });
  await page.screenshot({ path: "artifacts/phase-4/issue-319/account-security-ar-on.png" });
});

test("a signed-out visit to the security page redirects to sign-in", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: {
      cookies: [{ name: "fl_locale", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
      origins: [],
    },
  });
  const page = await context.newPage();
  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/sign-in/);
  await context.close();
});
