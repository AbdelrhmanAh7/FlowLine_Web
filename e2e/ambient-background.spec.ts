import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./stack";
import { setupUser } from "./helpers";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Paint check: nothing painted ABOVE the ambient layer at the glow centre may be an opaque full-viewport wrapper (an opaque
 * body/wrapper background would hide the glow and dots even though the layer is "visible" and non-interactive).
 *
 * elementsFromPoint is a hit test, and a `pointer-events: none` element is never a hit-test target, so the layer is made
 * hit-testable for the duration of the measurement only (its own pointer-events: none is asserted separately). The order
 * returned is the reverse paint order, which is what this check is about.
 */
async function expectAmbientPaintedAboveBackgrounds(page: Page) {
  const offenders = await page.evaluate(() => {
    const ambient = document.querySelector<HTMLElement>(".ambient-background");
    if (!ambient) return ["ambient layer is missing"];
    const previous = ambient.style.pointerEvents;
    ambient.style.pointerEvents = "auto";
    let stack: Element[];
    try {
      stack = document.elementsFromPoint(window.innerWidth / 2, 40);
    } finally {
      ambient.style.pointerEvents = previous;
    }
    const idx = stack.indexOf(ambient);
    if (idx < 0) return ["ambient layer is not under the glow point"];
    return stack.slice(0, idx).flatMap((el) => {
      const r = el.getBoundingClientRect();
      const coversViewport = r.width >= window.innerWidth * 0.95 && r.height >= window.innerHeight * 0.95;
      if (!coversViewport) return [];
      const cs = getComputedStyle(el);
      const m = /rgba?\(([^)]*)\)|color\(([^)]*)\)/.exec(cs.backgroundColor);
      const parts = (m?.[1] ?? m?.[2] ?? "").split(/[ ,/]+/).filter(Boolean);
      const alpha = cs.backgroundColor === "transparent" ? 0 : parts.length >= 4 ? Number.parseFloat(parts[parts.length - 1]) : 1;
      const clear = alpha === 0 && cs.backgroundImage === "none";
      return clear ? [] : [`${el.tagName.toLowerCase()}.${el.className} bg=${cs.backgroundColor} image=${cs.backgroundImage}`];
    });
  });
  expect(offenders).toEqual([]);
}

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
    // Stacking is verified by the paint check below, not by the raw z-index value.
    await expectAmbientPaintedAboveBackgrounds(page);
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
  const glow = field.locator(".ambient-glow");
  await expect(glow).toBeVisible();
  expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  const lightImage = await glow.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(lightImage).not.toBe("none");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(field).toHaveAttribute("data-theme", "system");
  await expect(glow).toBeVisible();
  expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  // The resolved glow must follow the system scheme (light uses a weaker tint than dark).
  await expect.poll(() => glow.evaluate((el) => getComputedStyle(el).backgroundImage)).not.toBe(lightImage);
});

test("ambient background is painted above the app shell's backgrounds @cross-browser", async ({ page }) => {
  const { workspace } = await setupUser(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/w/${workspace.slug}/flows`);
  await expect(page.locator(".ambient-background")).toHaveCount(1);
  await expectAmbientPaintedAboveBackgrounds(page);
});
