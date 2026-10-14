import { expect, test } from "@playwright/test";
import { AR_STATE, BASE_URL, EN_STATE } from "../playwright.config";
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

  // Turn MFA on through the API so this status test does not depend on the UI enrolment flow, then the page reads On.
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
  // The otpauth URI holds the secret: the QR is drawn in the browser, so no request may leave our own origin.
  const origin = new URL(BASE_URL).origin;
  const foreign: string[] = [];
  let enableCalls = 0;
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin) foreign.push(r.url());
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/auth/two-factor/enable") enableCalls++;
  });
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

  // The right password shows the QR, the secret below it and backup codes (left-to-right) with the one-time warning.
  const callsBefore = enableCalls;
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  const secret = page.getByTestId("totp-secret");
  await expect(secret).toBeVisible();
  await expect(secret).toHaveAttribute("dir", "ltr");
  const qr = page.getByTestId("totp-qr");
  await expect(qr).toBeVisible();
  await expect(qr.locator("svg")).toBeVisible();
  // One enable call feeds both the QR and the text secret (one totpURI state).
  expect(enableCalls - callsBefore).toBe(1);
  expect((await secret.boundingBox())!.y).toBeGreaterThan((await qr.boundingBox())!.y);
  // White square so the code scans on the dark theme.
  await expect(qr).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByTestId("backup-codes")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("backup-codes-warning")).toHaveText("Backup codes — shown only once, store them offline.");
  expect(foreign).toEqual([]);
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

  // Cancel hides the QR too.
  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enable" }).click();
  await expect(page.getByTestId("totp-qr")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("totp-qr")).toHaveCount(0);

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
  await expect(page.getByTestId("totp-qr")).toHaveCount(0);
  await expect(page.getByTestId("backup-codes")).toHaveCount(0);
  expect(foreign).toEqual([]);
  await page.reload();
  await expect(status).toHaveText("On");
});

test("cancelling a pending enable keeps the secret hidden", async ({ page }) => {
  await setupUser(page);
  await page.goto("/account/security");
  const status = page.getByTestId("two-factor-status");
  await expect(status).toHaveText("Off");

  // Hold the enable response so Cancel can be clicked while the request is in flight.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/two-factor/enable", async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole("button", { name: "Enable" }).click();
  await page.getByLabel("Account password").fill(PASSWORD);
  const started = page.waitForRequest("**/api/auth/two-factor/enable");
  const responded = page.waitForResponse((r) => r.url().includes("/api/auth/two-factor/enable") && r.status() === 200);
  await page.getByRole("button", { name: "Enable" }).click();
  await started;
  await page.getByRole("button", { name: "Cancel" }).click();
  release();
  await responded;

  // The late response must not reopen the secret: Cancel wins and the status stays Off.
  await expect(status).toHaveText("Off");
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
  await page.getByRole("button", { name: "Enable" }).click();

  await expect(dangerToast).toContainText("Two-factor is already enabled");
  await expect(dangerToast).not.toContainText("That password isn't correct.");
  await expect(page.getByTestId("totp-secret")).toHaveCount(0);
});

test("the enrolment QR stays inside the page in Arabic (RTL)", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, storageState: AR_STATE });
  const page = await context.newPage();
  await setupUser(page);
  await page.goto("/account/security");
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await page.getByRole("button", { name: "تفعيل" }).click();
  await page.getByLabel("كلمة مرور الحساب").fill(PASSWORD);
  await page.getByRole("button", { name: "تفعيل" }).click();
  const qr = page.getByTestId("totp-qr");
  await expect(qr).toBeVisible();
  const box = (await qr.boundingBox())!;
  const column = (await page.locator("main").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(column.x);
  expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width);
  expect(column.x + column.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await expect(page.getByTestId("totp-secret")).toHaveAttribute("dir", "ltr");
  await context.close();
});
