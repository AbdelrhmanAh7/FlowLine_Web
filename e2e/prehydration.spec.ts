import { expect, test } from "@playwright/test";
import { setupUser } from "./helpers";
/**
 * Regression (found by the WebKit run): text typed into a server-rendered field before React hydrated was silently
 * erased by the controlled input. The shared Input/Textarea now hand such early text to onChange on mount.
 */
test("text typed before hydration survives", { tag: "@cross-browser" }, async ({ page }) => {
  const { workspace } = await setupUser(page);
  // Slow down JS so the server-rendered form is interactive before React hydrates (like a slow device/network).
  await page.route("**/_next/static/**", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.goto(`/w/${workspace.slug}/knowledge`, { waitUntil: "commit" });
  await page.getByLabel("Title").fill("Typed early");
  await page.getByLabel("Text").fill("Before hydration");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("Title")).toHaveValue("Typed early");
  await expect(page.getByRole("button", { name: "Add text" })).not.toHaveAttribute("aria-disabled", "true");
});

test("sign-in forms submitted before hydration: SSO still works, credentials never reach a URL", { tag: "@cross-browser" }, async ({ page }) => {
  await page.route("**/_next/static/**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto("/sign-in", { waitUntil: "commit" });
  await page.getByLabel("Email").fill("someone@example.test");
  await page.getByLabel("Password").fill("not-a-real-password-1");
  await page.getByLabel("Workspace slug").fill("No-Such-Workspace-xyz");
  await page.getByRole("button", { name: "Sign in with SSO" }).click();
  await expect(page).toHaveURL(/\/sign-in\?sso_error=/);
  await expect(page.getByRole("alert").filter({ hasText: "SSO isn't set up for that workspace" })).toBeVisible({ timeout: 20_000 });

  await page.goto("/sign-in", { waitUntil: "commit" });
  await page.getByLabel("Email").fill("someone@example.test");
  await page.getByLabel("Password").fill("not-a-real-password-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  expect(page.url()).not.toContain("not-a-real-password");
  expect(page.url()).not.toContain("someone%40example");
});
