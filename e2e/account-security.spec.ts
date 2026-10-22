import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { BASE_URL } from "../playwright.config";
import { PASSWORD, setupUser } from "./helpers";
import { base32Decode, totpCodeFor } from "./tools/totp";

// Load AR messages at test-module time so the Arabic tests assert against the real
// i18n catalogue rather than hardcoded strings that drift out of sync with ar.json.
const ar = JSON.parse(readFileSync("src/i18n/messages/ar.json", "utf8")) as {
  account: { security: { twoFactor: Record<string, string> } };
};
const tf = ar.account.security.twoFactor;

test("user menu opens the security page and shows the two-step status", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
  await page.getByRole("menuitem", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  const status = page.getByTestId("two-factor-status");
  await expect(status).toHaveAttribute("data-state", "off");
  await page.screenshot({ path: "artifacts/phase-4/issue-196/account-security-en-ltr.png" });

  // Turn MFA on through the API, then the page reads On.
  const enable = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD } });
  expect(enable.ok()).toBeTruthy();
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret");
  expect(secret).toBeTruthy();
  const verify = await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCodeFor(base32Decode(secret!)) } });
  expect(verify.ok()).toBeTruthy();
  await page.reload();
  await expect(status).toHaveAttribute("data-state", "on");
});

test("the security page renders in Arabic with RTL layout", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.context().addCookies([
    { name: "fl_locale", value: "ar", domain: "localhost", path: "/" },
  ]);
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary").getByRole("button", { name: /E2E User/ }).click();
  await page.screenshot({ path: "artifacts/phase-4/issue-196/user-menu-ar-rtl.png" });

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

test("enable two-step verification from the account page", async ({ page }) => {
  await setupUser(page);
  await page.goto("/account/security");
  const status = page.getByTestId("two-factor-status");
  const dangerToast = page.locator('[aria-live="polite"]').getByRole("alert");
  await expect(status).toHaveAttribute("data-state", "off");

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
  await expect(status).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(dangerToast).toHaveCount(0);
  expect(enableRequests).toBe(0);

  // A wrong password shows an error and no secret.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(dangerToast).toHaveText("That password isn't valid. Try again.");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);

  // The right password shows the secret and backup codes (left-to-right) with the one-time warning.
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Submit" }).click();
  const secret = page.getByTestId("totp-secret");
  await expect(secret).toBeVisible();
  await expect(secret).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("backup-codes")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("backup-codes-warning")).toHaveText("Backup codes — shown only once, store them offline.");
  const raw = base32Decode((await secret.textContent())!.trim());

  // Cancel in the code form leaves it Off: no verify request, secret hidden.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(status).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  expect(verifyRequests).toBe(0);

  // A wrong code is rejected and the status is still Off after a reload.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Submit" }).click();
  // 000000 is only a safe "wrong" code when the accepted window (previous, current, next step) doesn't contain it.
  const current = base32Decode((await page.getByTestId("totp-secret").textContent())!.trim());
  const accepted = [-30_000, 0, 30_000].map((d) => totpCodeFor(current, Date.now() + d));
  await page.getByLabel("Authentication code").fill(["000000", "000001"].find((c) => !accepted.includes(c))!);
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(dangerToast.last()).toHaveText("That code isn't valid. Try the current one.");
  await page.reload();
  await expect(status).toHaveAttribute("data-state", "off");

  // Enabling again replaces the unconfirmed secret; the current code turns it On and hides the secret.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Submit" }).click();
  const second = base32Decode((await page.getByTestId("totp-secret").textContent())!.trim());
  expect(second.equals(raw)).toBeFalsy();
  await page.getByLabel("Authentication code").fill(totpCodeFor(second));
  await page.getByRole("button", { name: "Confirm and turn on" }).click();
  await expect(status).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
  await page.reload();
  await expect(status).toHaveAttribute("data-state", "on");
});

test("cancelling a pending enable keeps the secret hidden", async ({ page }) => {
  await setupUser(page);
  await page.goto("/account/security");
  const status = page.getByTestId("two-factor-status");
  await expect(status).toHaveAttribute("data-state", "off");

  // Step 1: Intercept the enable endpoint and hold the response until we explicitly release it.
  // This lets us click Cancel while the request is still in flight to test the race-condition guard.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/two-factor/enable", async (route) => {
    await held; // block until release() is called
    await route.continue(); // then let the real response through
  });

  // Step 2: Start the enable flow and submit the password.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  // Set up watchers before clicking Submit to avoid a race between click and the request firing.
  const started = page.waitForRequest("**/api/auth/two-factor/enable");
  const responded = page.waitForResponse((r) => r.url().includes("/api/auth/two-factor/enable") && r.status() === 200);
  await page.getByRole("button", { name: "Submit" }).click();

  // Step 3: Wait until the request is in flight, then cancel — before the response arrives.
  await started;
  await page.getByRole("button", { name: "Cancel" }).click();

  // Step 4: Release the held response and wait for it to complete.
  release();
  await responded;

  // Cancel must win the race: the late response must not reopen the secret.
  await expect(status).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
});

test("a non-password enable failure shows its own message", async ({ page }) => {
  await setupUser(page);
  await page.goto("/account/security");
  const dangerToast = page.locator('[aria-live="polite"]').getByRole("alert");

  // A 400 that is not about the password must keep the server's reason, not the "wrong password" line.
  await page.route("**/api/auth/two-factor/enable", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "TOTP_ALREADY_ENABLED", message: "Two-factor is already enabled" }),
    }),
  );

  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(dangerToast).toContainText("Two-factor is already enabled");
  await expect(dangerToast).not.toContainText("That password isn't valid. Try again.");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
});

test("enable two-step verification in Arabic (RTL)", async ({ page }) => {
  await setupUser(page);
  await page.context().addCookies([{ name: "fl_locale", value: "ar", path: "/", domain: "localhost" }]);
  await page.goto("/account/security");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const status = page.getByTestId("two-factor-status");
  await expect(status).toHaveAttribute("data-state", "off");
  // Assert the Off badge renders the Arabic catalogue text (not a hardcoded string).
  await expect(status).toHaveText(tf.off);

  // Click the Enable button (label comes from the AR catalogue, not a hardcoded string).
  await page.getByRole("button", { name: tf.enable }).click();
  await page.getByLabel(tf.password).fill("not-the-password-1");
  await page.getByRole("button", { name: tf.submit }).click();
  const dangerToast = page.locator('[aria-live="polite"]').getByRole("alert");
  // Wrong password: show the AR catalogue error text.
  await expect(dangerToast).toHaveText(tf.passwordInvalid);
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);

  // Correct password reveals the TOTP secret and backup codes (both LTR even in RTL layout).
  await page.getByLabel(tf.password).fill(PASSWORD);
  await page.getByRole("button", { name: tf.submit }).click();
  const secret = page.getByTestId("totp-secret");
  await expect(secret).toBeVisible();
  await expect(secret).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("backup-codes")).toHaveAttribute("dir", "ltr");
  // Warning text must match the AR catalogue key (not a hardcoded copy that drifts).
  await expect(page.getByTestId("backup-codes-warning")).toHaveText(tf.backupCodesWarning);

  // Confirm with the real TOTP code from the secret.
  const raw = base32Decode((await secret.textContent())!.trim());
  await page.getByLabel(tf.codeLabel).fill(totpCodeFor(raw));
  await page.getByRole("button", { name: tf.confirmButton }).click();
  // After confirmation the status must show On (AR catalogue value) and the secret/codes must be gone.
  await expect(status).toHaveAttribute("data-state", "on");
  await expect(status).toHaveText(tf.on);
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
  // Status persists across a reload.
  await page.reload();
  await expect(status).toHaveAttribute("data-state", "on");
  await expect(status).toHaveText(tf.on);
});

