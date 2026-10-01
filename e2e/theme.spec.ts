import { expect, test } from "@playwright/test";
import { setupUser } from "./helpers";
import { BASE_URL } from "./stack";

/** The fl_theme cookie: Light / Dark / System, server-applied to <html data-theme>, Arabic-safe. */
test.describe("theme switch", () => {
  test("persists across reload and appears in the server HTML", async ({ page, context }) => {
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect((await context.cookies()).find((c) => c.name === "fl_theme")?.value).toBe("light");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // No flash: the server itself renders the attribute (no client-side theme script).
    expect(await (await page.request.get("/sign-in")).text()).toContain('data-theme="light"');

    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("system follows the OS color scheme", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "System" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(244, 244, 245)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(9, 9, 11)");
  });

  test("works in Arabic (RTL)", async ({ page, context }) => {
    await context.addCookies([{ name: "fl_locale", value: "ar", url: BASE_URL }]);
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "فاتح" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("the user menu switches the theme too", async ({ page }) => {
    const { workspace } = await setupUser(page);
    await page.goto(`/w/${workspace.slug}/flows`);
    await page.getByRole("button", { name: "E2E User" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
