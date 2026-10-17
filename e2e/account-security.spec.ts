import { expect, test } from "@playwright/test";
import { BASE_URL } from "../playwright.config";
import { PASSWORD, setupUser } from "./helpers";
import { base32Decode, totpCodeFor } from "./tools/totp";

test("user menu opens the security page and shows the two-step status", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
  await page.getByRole("menuitem", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

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
