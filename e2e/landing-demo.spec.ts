import { expect, test } from "@playwright/test";

/**
 * Landing demo video (#96). The global config runs with reducedMotion: "reduce": the video must not autoplay, the poster
 * stays and the control offers "Play demo", which plays it. Autoplay with motion allowed is covered by e2e-army/96-landing-demo.e2e.ts.
 */
const paused = (page: import("@playwright/test").Page) => page.getByTestId("demo-video").evaluate((v: HTMLVideoElement) => v.paused);

test("reduced motion: the demo shows its poster and a Play demo button instead of autoplaying", async ({ page }) => {
  await page.addInitScript(() => document.addEventListener("play", () => ((window as unknown as { demoPlays: number }).demoPlays = 1), true));
  await page.goto("/");
  const video = page.getByTestId("demo-video");
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute("poster", "/media/flowline-demo.jpg");
  const play = page.getByRole("button", { name: "Play demo" });
  await expect(play).toBeVisible();
  expect(await paused(page)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { demoPlays?: number }).demoPlays)).toBeUndefined(); // never started on its own

  await play.click();
  await expect.poll(() => paused(page)).toBe(false);
  await expect(page.getByRole("button", { name: "Pause demo" })).toBeVisible();
});

test("motion allowed: the muted demo autoplays in view and a keyboard pause sticks", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "no-preference", storageState: { cookies: [{ name: "fl_locale", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] } });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("demo-video").scrollIntoViewIfNeeded();
  await expect.poll(() => paused(page), { timeout: 15_000 }).toBe(false);
  await page.getByRole("button", { name: "Pause demo" }).press("Enter");
  await expect.poll(() => paused(page)).toBe(true);
  await page.mouse.wheel(0, 50); // still in view: a visitor's pause is not undone by the observer
  await expect(page.getByRole("button", { name: "Play demo" })).toBeVisible();
  expect(await paused(page)).toBe(true);
  await context.close();
});

test("Arabic: the demo control is labelled in Arabic, mirrored to the start edge of RTL, with Arabic captions by default", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const video = page.getByTestId("demo-video");
  await video.scrollIntoViewIfNeeded();
  const button = page.getByRole("button", { name: "تشغيل العرض" });
  await expect(button).toBeVisible();
  // `end-3` is the left edge in RTL.
  const [v, b] = [(await video.boundingBox())!, (await button.boundingBox())!];
  expect(b.x - v.x).toBeLessThan(v.x + v.width - (b.x + b.width));
  expect(await video.locator("track[default]").getAttribute("srclang")).toBe("ar");
  await context.close();
});
