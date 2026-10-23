import { expect, test } from "@playwright/test";
import { setupUser } from "./helpers";

test.describe("flows list and dashboard UI @cross-browser", () => {
  test("flows list displays runCount, lastRunStatus, and lastRunAt in LTR and RTL", async ({ page }) => {
    test.setTimeout(60_000);
    const { workspace } = await setupUser(page, { template: "blank" });

    // Navigate to flows list
    await page.goto(`/w/${workspace.slug}/flows`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Verify dashboard navigation button is present and clickable
    const dashBtn = page.getByTestId("dashboard-button");
    await expect(dashBtn).toBeVisible();
    await dashBtn.click();
    await expect(page).toHaveURL(new RegExp(`/w/${workspace.slug}/dashboard$`));

    // Navigate back to /w/{ws}/flows
    await page.goto(`/w/${workspace.slug}/flows`);

    // Locate statistics in UI: runCount, lastRunStatus, lastRunAt
    const runCountEl = page.getByTestId("runCount");
    const lastRunStatusEl = page.getByTestId("lastRunStatus");
    const lastRunAtEl = page.getByTestId("lastRunAt");

    await expect(runCountEl.first()).toBeVisible();
    await expect(lastRunStatusEl.first()).toBeVisible();
    await expect(lastRunAtEl.first()).toBeVisible();

    // Capture LTR screenshot
    await page.screenshot({ path: "artifacts/phase-4/issue-117/flows-list-ltr.png", fullPage: true });

    // Switch to Arabic (RTL) via cookie
    await page.context().addCookies([{ name: "fl_locale", value: "ar", domain: "localhost", path: "/" }]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await expect(runCountEl.first()).toBeVisible();
    await expect(lastRunStatusEl.first()).toBeVisible();
    await expect(lastRunAtEl.first()).toBeVisible();

    // Capture RTL screenshot
    await page.screenshot({ path: "artifacts/phase-4/issue-117/flows-list-rtl.png", fullPage: true });
  });

  test("dashboard route /w/{ws}/dashboard renders 200 without 404", async ({ page }) => {
    const { workspace } = await setupUser(page);
    const res = await page.goto(`/w/${workspace.slug}/dashboard`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
