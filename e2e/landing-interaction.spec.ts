import { expect, test } from "@playwright/test";
import { BASE_URL } from "./stack";

test.describe("landing interactive walkthrough @cross-browser", () => {
  test("a new visitor starts in Arabic and light even when their device prefers dark", async ({ page, context }) => {
    await context.clearCookies();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("landing-preferences").getByRole("button", { name: "فاتح", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  for (const locale of ["ar", "en"] as const) {
    test(`${locale}: desktop cards have equal dimensions and every selection changes the illustration`, async ({ page, context }) => {
      await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }]);
      await page.goto("/");
      // Both the hero's three cards and the walkthrough's five cards must be internally consistent.
      for (const flow of await page.getByTestId("landing-flow").all()) {
        const sizes = await flow.getByTestId("landing-flow-node").evaluateAll((nodes) => nodes.map((node) => {
          const { width, height } = node.getBoundingClientRect();
          return { width, height };
        }));
        expect(sizes.length).toBeGreaterThan(1);
        expect(Math.max(...sizes.map((size) => size.width)) - Math.min(...sizes.map((size) => size.width))).toBeLessThanOrEqual(1);
        expect(Math.max(...sizes.map((size) => size.height)) - Math.min(...sizes.map((size) => size.height))).toBeLessThanOrEqual(1);
      }
      const hero = page.getByTestId("landing-hero-scene");
      const heroPreview = page.getByTestId("landing-hero-step-preview");
      for (let index = 0; index < 3; index++) {
        await hero.getByTestId("landing-flow-node").nth(index).click();
        await expect(heroPreview).toHaveAttribute("data-step", String(index));
        await expect(heroPreview.getByRole("heading")).toHaveText(await hero.getByTestId("landing-flow-node").nth(index).locator("p").first().innerText());
        await expect(heroPreview.getByRole("img")).toBeVisible();
        await expect(heroPreview).not.toContainText("landing.flowDetails.");
      }
      const scene = page.getByTestId("landing-flow-scene");
      const cards = scene.getByTestId("landing-flow-node");
      const preview = page.getByTestId("landing-step-preview");
      await expect(cards).toHaveCount(5);
      const illustrations = new Set<string>();
      for (let index = 0; index < 5; index++) {
        await cards.nth(index).click();
        await expect(cards.nth(index)).toHaveAttribute("aria-pressed", "true");
        await expect(scene.locator('[aria-pressed="true"]')).toHaveCount(1);
        await expect(preview).toHaveAttribute("data-step", String(index));
        const label = await cards.nth(index).locator("p").first().innerText();
        await expect(preview.getByRole("heading")).toHaveText(label);
        await expect(preview.getByRole("img")).toHaveAccessibleName(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        illustrations.add(await preview.getByRole("img").innerHTML());
      }
      expect(illustrations.size, "each selected step has its own visual example").toBe(5);
      const features = page.locator("#features");
      await features.getByRole("navigation").getByRole("link").last().click();
      await expect(page).toHaveURL(/[?]section=feature-integrations/);
      await expect(page.locator("#feature-integrations")).toBeInViewport();
      expect(new URL(page.url()).hash).toBe("");
    });

    test(`${locale}: phone walkthrough fits and supports Enter and Space`, async ({ page, context }) => {
      await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }]);
      await page.setViewportSize({ width: 360, height: 812 });
      await page.goto("/");
      const cards = page.getByTestId("landing-flow-scene").getByTestId("landing-flow-node");
      const preview = page.getByTestId("landing-step-preview");
      for (const [index, key] of [[1, "Enter"], [3, "Space"]] as const) {
        await cards.nth(index).scrollIntoViewIfNeeded();
        await cards.nth(index).focus();
        await page.keyboard.press(key);
        await expect(cards.nth(index)).toBeFocused();
        await expect(cards.nth(index)).toHaveAttribute("aria-pressed", "true");
        await expect(preview).toHaveAttribute("data-step", String(index));
      }
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toHaveAttribute("data-step", "3");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const image = await preview.getByRole("img").boundingBox();
      expect(image).not.toBeNull();
      expect(image!.x).toBeGreaterThanOrEqual(0);
      expect(image!.x + image!.width).toBeLessThanOrEqual(360);
    });
  }

  test("desktop scroll advances the selected step from first to last", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const scene = page.getByTestId("landing-flow-scene");
    const preview = page.getByTestId("landing-step-preview");
    const geometry = await scene.evaluate((element) => ({ top: element.getBoundingClientRect().top + window.scrollY, span: element.getBoundingClientRect().height - window.innerHeight }));
    expect(geometry.span).toBeGreaterThan(0);
    for (const [fraction, expectedStep] of [[0.02, 0], [0.45, 2], [0.95, 4]] as const) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), geometry.top + geometry.span * fraction);
      await expect(preview).toHaveAttribute("data-step", String(expectedStep));
      await expect(scene.getByTestId("landing-flow-node").nth(expectedStep)).toHaveAttribute("aria-pressed", "true");
    }
  });
});
