import { expect, test } from "@playwright/test";
import { BASE_URL } from "./stack";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test("quiet ambient background remains decorative, subtle and non-interactive @cross-browser", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const locale of ["ar", "en"]) for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }, { name: "fl_theme", value: theme, url: BASE_URL }]);
    await page.goto("/");
    const field = page.locator(".ambient-background");

    // Assert one ambient layer per page
    await expect(page.locator(".ambient-background")).toHaveCount(1);
    await expect(field).toHaveAttribute("data-locale", locale);
    await expect(field).toHaveAttribute("data-theme", theme);

    // Non-interactive: pointer-events none, aria-hidden
    await expect(field).toHaveAttribute("aria-hidden", "true");
    expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    expect(await field.evaluate((el) => getComputedStyle(el).zIndex)).toBe("1");
    expect(await field.evaluate((el) => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return hit !== el && (!hit || !el.contains(hit));
    })).toBe(true);

    // No .ambient-ribbon, particles or multi-color blobs
    await expect(field.locator(".ambient-ribbon")).toHaveCount(0);
    await expect(field.locator(".ambient-particles")).toHaveCount(0);

    // Soft brand-tinted glow and subtle fading dot grid are present and visible
    const glow = field.locator(".ambient-glow");
    await expect(glow).toBeVisible();
    expect(await glow.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))).toBeGreaterThan(0);

    const dots = field.locator(".ambient-dots");
    await expect(dots).toBeVisible();
    expect(await dots.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))).toBeGreaterThan(0);

    // Keep screenshot capture lines so CI records ambient-{ar,en}-{light,dark}.png
    if (process.env.E2E_SCREENSHOT_DIR) {
      mkdirSync(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.E2E_SCREENSHOT_DIR, `ambient-${locale}-${theme}.png`) });
    }
  }

  // Reduced motion => no animation
  await page.emulateMedia({ reducedMotion: "reduce" });
  const field = page.locator(".ambient-background");
  expect(await field.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const glow = field.locator(".ambient-glow");
  expect(await glow.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await glow.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^(?:0s|0\.000001s)$/);
  const dots = field.locator(".ambient-dots");
  expect(await dots.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await dots.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^(?:0s|0\.000001s)$/);
});

test("ambient background respects system theme and stays non-interactive @cross-browser", async ({ page, context }) => {
  await context.addCookies([{ name: "fl_locale", value: "en", url: BASE_URL }, { name: "fl_theme", value: "system", url: BASE_URL }]);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.goto("/");
  const field = page.locator(".ambient-background");
  await expect(field).toHaveAttribute("data-theme", "system");
  await expect(field.locator(".ambient-glow")).toBeVisible();
  expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(field).toHaveAttribute("data-theme", "system");
  await expect(field.locator(".ambient-glow")).toBeVisible();
  expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
});
