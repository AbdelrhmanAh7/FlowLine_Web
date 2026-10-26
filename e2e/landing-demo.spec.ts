import { expect, test } from "@playwright/test";

for (const locale of ["ar", "en"]) {
  test(`AC1 poster is the LCP resource without autoplay (${locale})`, async ({ page }) => {
    await page.context().addCookies([{ url: "http://localhost:3100", name: "fl_locale", value: locale }]);
    await page.addInitScript(() => new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) document.documentElement.dataset.lcp = "url" in entry ? String(entry.url) : "";
    }).observe({ type: "largest-contentful-paint", buffered: true }));
    const videos: string[] = [];
    page.on("request", (request) => { if (request.url().endsWith(".mp4")) videos.push(request.url()); });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-lcp", new RegExp(`hero\\.${locale}\\.light\\.poster\\.`));
    expect(videos).toEqual([]);
  });
  test(`AC1 hero waits for load, selects one source and keeps its poster (${locale})`, async ({ page }, info) => {
    await page.context().addCookies([{ url: "http://localhost:3100", name: "fl_locale", value: locale }]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 200 });
    await page.addInitScript((preferAv1) => {
      Object.defineProperty(navigator, "mediaCapabilities", { value: { decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: preferAv1 }) } });
      HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event("pause")); };
      HTMLMediaElement.prototype.play = function () { this.preload = "auto"; this.load(); this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
    }, locale === "ar");
    const downloads: string[] = [];
    await page.route("**/media/demo/*.mp4", async (route) => { downloads.push(route.request().url()); await route.fulfill({ status: 204 }); });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/media/demo/*.jpg", async (route) => { await held; await route.continue(); });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const video = page.locator(".hero-scrub video");
    await expect(video).toBeVisible();
    await expect(video).not.toHaveAttribute("src");
    expect(downloads).toEqual([]);
    release();
    await page.waitForLoadState("load");
    await expect(video).not.toHaveAttribute("src");
    await video.scrollIntoViewIfNeeded();
    await expect(video).toHaveAttribute("src", new RegExp(`hero\\.${locale}\\.light\\.${locale === "ar" ? "av1" : "h264"}\\.`));
    await expect.poll(() => downloads.length).toBe(1);
    await expect(video).toHaveAttribute("muted", "");
    await expect(video).not.toHaveAttribute("autoplay");
    await expect(page.locator('[rel="preload"][as="image"]')).toHaveAttribute("href", /hero\..*\.jpg$/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByTestId("landing-demo-poster")).toHaveAttribute("fetchpriority", "high");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: info.outputPath(`hero-${locale}.png`) });
  });
}
