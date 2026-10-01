import { expect, test } from "@playwright/test";
import { BASE_URL } from "./stack";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test("four ambient variants remain decorative and respond to scroll/click @cross-browser", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const variants = new Set<string>();
  for (const locale of ["ar", "en"]) for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }, { name: "fl_theme", value: theme, url: BASE_URL }]);
    await page.goto("/");
    const field = page.locator(".ambient-background");
    await expect(field).toHaveAttribute("aria-hidden", "true");
    const expectedScene = locale === "ar" ? (theme === "light" ? "pearl-ribbon-sweep" : "auroral-lens") : (theme === "light" ? "glass-fluid-arc" : "woven-light-trail");
    const expectedTopology = locale === "ar" ? (theme === "light" ? "ribbon-sweep" : "auroral-lens") : (theme === "light" ? "glass-arc" : "woven-trail");
    await expect(field).toHaveAttribute("data-scene", expectedScene);
    await expect(field).toHaveAttribute("data-topology", expectedTopology);
    variants.add(await field.getAttribute("data-scene") ?? "");
    await expect(field.locator(`[data-scene-map="${expectedScene}"]`)).toBeVisible();
    await expect(field.locator(".ambient-scene:visible")).toHaveCount(1);
    expect(await field.locator(".ambient-ribbon:visible").count()).toBeGreaterThan(2);
    await expect(field.locator(".ambient-particles circle")).toHaveCount(5);
    expect(await field.evaluate((el) => getComputedStyle(el).zIndex)).toBe("1");
    expect(await field.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    expect(await field.evaluate((el) => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return hit !== el && (!hit || !el.contains(hit));
    })).toBe(true);
    expect(await field.locator(".ambient-background__map").evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))).toBeGreaterThan(0);
    expect(await field.locator(".ambient-scene:visible").evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))).toBeGreaterThan(0);
    if (process.env.E2E_SCREENSHOT_DIR) {
      mkdirSync(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.E2E_SCREENSHOT_DIR, `ambient-${locale}-${theme}.png`) });
    }
    await page.mouse.move(100, 150);
    await expect.poll(() => field.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ambient-near-x"))).not.toBe("");
    await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * 0.45));
    await expect.poll(() => field.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ambient-flow"))).not.toBe("0.000");
    await expect.poll(() => field.getAttribute("data-active-step")).not.toBe("0");
    await page.mouse.down();
    await expect(field).toHaveAttribute("data-pulse", "true");
    await expect.poll(() => field.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ambient-click-x"))).not.toBe("");
    await page.mouse.up();
    await expect(field).not.toHaveAttribute("data-pulse", "true");
  }
  expect(variants.size).toBe(4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const field = page.locator(".ambient-background");
  await expect.poll(() => field.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ambient-near-x"))).toBe("");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.up();
  await expect(field).not.toHaveAttribute("data-pulse", "true");
  expect(await field.locator(".ambient-background__map").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
});

test("ambient scene follows system theme and normalizes nested scrolling @cross-browser", async ({ page, context }) => {
  await context.addCookies([{ name: "fl_locale", value: "en", url: BASE_URL }, { name: "fl_theme", value: "system", url: BASE_URL }]);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.goto("/");
  const field = page.locator(".ambient-background");
  await expect(field).toHaveAttribute("data-scene", "glass-fluid-arc");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(field).toHaveAttribute("data-scene", "woven-light-trail");
  await page.evaluate(() => {
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;height:100px;width:100px;overflow:auto;top:0;left:0";
    const content = document.createElement("div");
    content.style.height = "500px";
    container.append(content);
    document.body.append(container);
    container.scrollTop = 300;
    container.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => field.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ambient-flow"))).toBe("0.750");
  await expect(field).toHaveAttribute("data-active-step", "3");
});
