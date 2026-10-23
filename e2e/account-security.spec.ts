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
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/account-security-en-ltr.png", fullPage: true });

  // Turn MFA on through the API (the UI flow is a later part), then the page reads On.
  const enable = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD } });
  expect(enable.ok()).toBeTruthy();
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCodeFor(base32Decode(secret)) } });
  expect(verify.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  // Cancel leaves it Off; a wrong password shows an error and no secret.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(page.getByText("That password isn't correct.")).toBeVisible();
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

  // A wrong code is rejected and the status is still Off after a reload.
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page.getByText("That code isn't valid. Try the current one.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  // Enabling again replaces the unconfirmed secret; the current code turns it On and hides the secret.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  const second = base32Decode((await page.getByTestId("totp-secret").textContent())!.trim());
  expect(second.equals(raw)).toBeFalsy();
  await page.getByLabel("Authentication code").fill(totpCodeFor(second));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
});

test("enable, sign in with the code, disable", async ({ page }) => {
  test.setTimeout(120_000);
  const { email, workspace } = await setupUser(page);

  const signOut = async () => {
    await page.goto(`/w/${workspace.slug}/flows`);
    await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  };
  const signIn = async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };

  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/auth/two-factor/")) mutations.push(request.url());
  });

  // Enable through the UI; Disable is not offered while it is Off.
  await page.goto("/account/security");
  await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(0);
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(page.getByTestId("totp-secret")).toBeVisible();
  const beforeCancel = mutations.length;
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enable" })).toBeVisible();
  expect(mutations).toHaveLength(beforeCancel);
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(page.getByTestId("totp-secret")).toBeVisible();
  const raw = base32Decode((await page.getByTestId("totp-secret").textContent())!.trim());
  await page.getByLabel("Authentication code").fill(totpCodeFor(raw));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(page.getByText("On", { exact: true })).toBeVisible();

  // Signing in now asks for the code: a wrong one is refused, the next window's code opens the account.
  await signOut();
  await signIn();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code isn't valid. Try the current one.")).toBeVisible();
  await page.getByLabel("Authentication code").fill(totpCodeFor(raw, Date.now() + 30_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  // Disable: a wrong password leaves it On, the right one turns it Off, also after a reload.
  await page.goto("/account/security");
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  const beforeDisableCancel = mutations.length;
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Account password")).toHaveCount(0);
  expect(mutations).toHaveLength(beforeDisableCancel);
  await page.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByLabel("Account password")).toHaveValue("");
  await page.getByLabel("Account password").fill("not-the-password-1");
  const wrongRequest = page.waitForRequest((r) => r.url().endsWith("/api/auth/two-factor/disable") && r.method() === "POST");
  await page.getByRole("button", { name: "Disable" }).click();
  expect((await wrongRequest).postDataJSON()).toEqual({ password: "not-the-password-1" });
  await expect(page.getByText("That password isn't correct.")).toBeVisible();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Account password")).toHaveValue("");
  await page.getByLabel("Account password").fill(PASSWORD);
  const disableRequest = page.waitForRequest((r) => r.url().endsWith("/api/auth/two-factor/disable") && r.method() === "POST");
  await page.getByRole("button", { name: "Disable" }).click();
  expect((await disableRequest).postDataJSON()).toEqual({ password: PASSWORD });
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  // Signing in again needs no code.
  await signOut();
  await signIn();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toHaveCount(0);
});

test("Cancel is disabled while disable request is in flight", async ({ page }) => {
  await setupUser(page);

  // Turn MFA on through the API so Disable is offered.
  const enable = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD } });
  expect(enable.ok()).toBeTruthy();
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCodeFor(base32Decode(secret)) } });
  expect(verify.ok()).toBeTruthy();

  await page.goto("/account/security");
  await expect(page.getByText("On", { exact: true })).toBeVisible();

  // Click Disable to open password form.
  await page.getByRole("button", { name: "Disable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);

  // Intercept and delay /api/auth/two-factor/disable.
  let finishRequest: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });

  await page.route("**/api/auth/two-factor/disable", async (route) => {
    await delayed;
    await route.continue();
  });

  const cancelButton = page.getByRole("button", { name: "Cancel" });
  await expect(cancelButton).toBeEnabled();

  // Submit disable form.
  await page.getByRole("button", { name: "Disable" }).click();

  // Assert Cancel is disabled while the request is pending.
  await expect(cancelButton).toBeDisabled();

  // Let the request finish.
  finishRequest();

  // Status becomes Off.
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
});
