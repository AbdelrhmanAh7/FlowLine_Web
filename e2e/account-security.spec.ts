import { expect, test } from "@playwright/test";
import { BASE_URL, EN_STATE } from "../playwright.config";
import { PASSWORD, setupUser } from "./helpers";
import { base32Decode, totpCodeFor } from "./tools/totp";

test("user menu opens the security page and shows the two-step status", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
  await page.getByRole("menuitem", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  const status = page.getByTestId("two-factor-status");
  await expect(status).toHaveText("Off");

  // Turn MFA on through the API, then the page reads On.
  const enable = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD } });
  expect(enable.ok()).toBeTruthy();
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCodeFor(base32Decode(secret)) } });
  expect(verify.ok()).toBeTruthy();
  await page.reload();
  await expect(status).toHaveText("On");
});

test("a signed-out visit to the security page redirects to sign-in", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, storageState: EN_STATE });
  const page = await context.newPage();
  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/sign-in/);
  await context.close();
});

test("enable two-step verification from the account page", async ({ page }) => {
  await setupUser(page);
  await page.goto("/account/security");
  const status = page.getByTestId("two-factor-status");
  const dangerToast = page.locator('[aria-live="polite"]').getByRole("alert");
  await expect(status).toHaveText("Off");

  // Watch the two-factor endpoints: Cancel must never submit them.
  let enableRequests = 0;
  let verifyRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/two-factor/enable")) enableRequests += 1;
    if (req.url().includes("/api/auth/two-factor/verify-totp")) verifyRequests += 1;
  });

  // Cancel in the password form leaves it Off: no enable request, no error toast.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(status).toHaveText("Off");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(dangerToast).toHaveCount(0);
  expect(enableRequests).toBe(0);

  // A wrong password shows an error and no secret.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(dangerToast).toHaveText("That password isn't correct.");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);

  // The right password shows the secret and backup codes (left-to-right) with the one-time warning.
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  const secret = page.getByTestId("totp-secret");
  await expect(secret).toBeVisible();
  await expect(secret).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("backup-codes")).toHaveAttribute("dir", "ltr");
  await expect(page.getByText(/shown only once/)).toBeVisible();
  const raw = base32Decode((await secret.textContent())!.trim());

  // Cancel in the code form leaves it Off: no verify request, secret hidden.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(status).toHaveText("Off");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  expect(verifyRequests).toBe(0);

  // A wrong code is rejected and the status is still Off after a reload.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(dangerToast.last()).toHaveText("That code isn't valid. Try the current one.");
  await page.reload();
  await expect(status).toHaveText("Off");

  // Enabling again replaces the unconfirmed secret; the current code turns it On and hides the secret.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  const second = base32Decode((await page.getByTestId("totp-secret").textContent())!.trim());
  expect(second.equals(raw)).toBeFalsy();
  await page.getByLabel("Authentication code").fill(totpCodeFor(second));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(status).toHaveText("On");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
  await page.reload();
  await expect(status).toHaveText("On");
});
