import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { BASE_URL } from "./stack";

/**
 * Landing demo media (#100, part of #96). The server reads public/media/demo/manifest.json; #99 produces the real media, so this
 * spec runs against e2e/fixtures/demo/ instead: the test-only cookie `fl_test_demo=fixture` (honoured only on FLOWLINE_ENV=test)
 * switches the manifest, and page.route answers every /media/demo/* request from the fixtures. `fl_test_demo=off` (set by
 * playwright.config.ts for every other spec) ignores a real manifest, so the legacy hero keeps being tested. Playwright builds lack
 * H.264, so playback is stubbed (see PLAYER_STUB): these tests are about WHEN video is requested, WHICH file, and what the
 * visitor can operate, never about decoding.
 */
const FIX = "e2e/fixtures/demo";
const MP4 = readFileSync(`${FIX}/sample.mp4`);
const JPG = readFileSync(`${FIX}/sample.jpg`);
const VTT = { ar: readFileSync(`${FIX}/ar.vtt`, "utf8"), en: readFileSync(`${FIX}/en.vtt`, "utf8") };
type Locale = "en" | "ar";
type Caps = "av1" | "h264";

/** Stub player: play/pause/paused/currentTime are deterministic; mediaCapabilities answers per `caps`; `play` can reject. */
const PLAYER_STUB = ({ caps, reject }: { caps: Caps; reject: boolean }) => {
  const w = window as unknown as { __plays: number; __rejectPlay: boolean };
  w.__plays = 0;
  w.__rejectPlay = reject;
  const proto = HTMLMediaElement.prototype;
  type S = HTMLMediaElement & { __p?: boolean; __t?: number };
  Object.defineProperty(proto, "paused", { configurable: true, get() { return (this as S).__p !== false; } });
  Object.defineProperty(proto, "currentTime", { configurable: true, get() { return (this as S).__t ?? 0; }, set(v: number) { (this as S).__t = v; } });
  proto.play = function (this: S) {
    if (w.__rejectPlay) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    w.__plays++;
    this.__p = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  proto.pause = function (this: S) {
    if (this.__p === false) { this.__p = true; this.dispatchEvent(new Event("pause")); }
  };
  Object.defineProperty(navigator, "mediaCapabilities", {
    configurable: true,
    value: { decodingInfo: async (c: { video?: { contentType: string } }) => { const av1 = /av01/.test(c.video?.contentType ?? ""); return caps === "av1" ? { supported: true, smooth: true, powerEfficient: av1 } : { supported: !av1, smooth: !av1, powerEfficient: !av1 }; } },
  });
};

interface Opts { locale?: Locale; demo?: "fixture" | "off"; motion?: boolean; caps?: Caps; reject?: boolean; connection?: { saveData?: boolean; effectiveType?: string }; width?: number }

async function open(browser: Browser, o: Opts = {}) {
  const { locale = "en", demo = "fixture", motion = true, caps = "av1", reject = false, connection, width = 1440 } = o;
  const cookie = (name: string, value: string) => ({ name, value, domain: new URL(BASE_URL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const });
  const context: BrowserContext = await browser.newContext({
    reducedMotion: motion ? "no-preference" : "reduce",
    viewport: { width, height: 900 },
    storageState: { cookies: [cookie("fl_test_beta_mode", "open"), cookie("fl_locale", locale), cookie("fl_test_demo", demo)], origins: [] },
  });
  const requests: { url: string; beforeLoad: boolean }[] = [];
  let loaded = false;
  await context.route("**/media/demo/**", (route) => {
    const url = new URL(route.request().url());
    requests.push({ url: url.pathname, beforeLoad: !loaded });
    const name = url.pathname;
    if (name.endsWith(".mp4")) return route.fulfill({ status: 200, contentType: "video/mp4", body: MP4 });
    if (name.endsWith(".vtt")) return route.fulfill({ status: 200, contentType: "text/vtt", body: VTT[name.includes(".ar.") ? "ar" : "en"] });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPG });
  });
  const page = await context.newPage();
  page.on("load", () => { loaded = true; });
  await page.addInitScript(PLAYER_STUB, { caps, reject });
  if (connection) await page.addInitScript((c) => Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: false, effectiveType: "4g", ...c } }), connection);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|media/i.test(m.text())) errors.push(m.text()); });
  await page.goto("/");
  return { context, page, requests, errors, videos: (re: RegExp) => requests.filter((r) => re.test(r.url) && r.url.endsWith(".mp4")) };
}

const hero = (page: Page) => page.locator(".hero-scrub video[data-demo-clip='hero']");
const paused = (loc: ReturnType<Page["locator"]>) => loc.evaluate((v: HTMLVideoElement) => v.paused);

test.describe("with a manifest", () => {
  test("hero: DemoVideo inside .hero-scrub, poster preloaded as LCP, no autoplay attribute, loop starts muted after load, one AV1 file", async ({ browser }) => {
    const { context, page, videos, errors } = await open(browser);
    const v = hero(page);
    await expect(v).toHaveCount(1);
    await expect(v).not.toHaveAttribute("autoplay", /.*/);
    await expect(v).toHaveAttribute("preload", "none");
    await expect(v).toHaveAttribute("playsinline", "");
    for (const a of ["width", "height", "aria-label", "poster"]) await expect(v).toHaveAttribute(a, /.+/);
    const poster = (await v.getAttribute("poster"))!;
    expect(poster).toContain("/media/demo/hero.en.light.poster.");
    await expect(page.locator(`link[rel="preload"][as="image"][href="${poster}"]`)).toHaveAttribute("fetchpriority", "high");
    await expect.poll(() => videos(/\/hero\./).length).toBe(1);
    expect(videos(/\/hero\./)[0]).toMatchObject({ beforeLoad: false });
    expect(videos(/\/hero\./)[0]!.url).toContain(".av1.");
    expect(await v.evaluate((el: HTMLVideoElement) => el.muted && el.hasAttribute("muted"))).toBe(true);
    await expect.poll(() => paused(v)).toBe(false);
    expect(await page.evaluate(() => (document.querySelector(".hero-scrub video") as HTMLElement).getBoundingClientRect().height)).toBeGreaterThan(200);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("source choice: H.264 when AV1 is not supported; still exactly one video file", async ({ browser }) => {
    const { context, page, videos } = await open(browser, { caps: "h264" });
    await expect.poll(() => videos(/\/hero\./).length).toBe(1);
    expect(videos(/\/hero\./)[0]!.url).toContain(".h264.");
    await expect(page.locator(".hero-scrub [data-demo-toggle]")).toBeVisible();
    await context.close();
  });

  test("reduced motion: no video request, poster and a visible Play demo button; pressing it plays once without loop", async ({ browser }) => {
    const { context, page, requests, videos } = await open(browser, { motion: false });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    expect(videos(/./)).toEqual([]);
    const play = page.locator(".hero-scrub").getByRole("button", { name: "Play demo" });
    await expect(play).toBeVisible();
    expect(await paused(hero(page))).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await play.click();
    await expect.poll(() => videos(/\/hero\./).length).toBe(1);
    await expect.poll(() => paused(hero(page))).toBe(false);
    expect(await hero(page).evaluate((v: HTMLVideoElement) => v.loop)).toBe(false);
    expect(requests.filter((r) => r.url.endsWith(".mp4")).length).toBe(1);
    await context.close();
  });

  for (const [name, connection] of [["saveData", { saveData: true }], ["2g", { effectiveType: "2g" }], ["slow-2g", { effectiveType: "slow-2g" }]] as const) {
    test(`${name}: no video request and a Play demo button`, async ({ browser }) => {
      const { context, page, videos } = await open(browser, { connection });
      await page.evaluate(() => document.getElementById("demo")?.scrollIntoView());
      await page.waitForTimeout(600);
      expect(videos(/./)).toEqual([]);
      await expect(page.locator(".hero-scrub").getByRole("button", { name: "Play demo" })).toBeVisible();
      await context.close();
    });
  }

  test("turning reduced motion on while the loop runs pauses it at once", async ({ browser }) => {
    const { context, page } = await open(browser);
    await expect.poll(() => paused(hero(page))).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => paused(hero(page))).toBe(true);
    await expect(page.locator(".hero-scrub").getByRole("button", { name: "Play demo" })).toBeVisible();
    await context.close();
  });

  test("Pause/Play: at least 44x44, aria-pressed, keyboard operable, remembered for the session", async ({ browser }) => {
    const { context, page } = await open(browser);
    const toggle = page.locator(".hero-scrub [data-demo-toggle]");
    await expect.poll(() => paused(hero(page))).toBe(false);
    const box = (await toggle.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => paused(hero(page))).toBe(true);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveText("Play demo");
    await page.reload();
    await page.waitForTimeout(800);
    expect(await paused(hero(page))).toBe(true); // the visitor's pause is kept for the session
    await expect(page.locator(".hero-scrub [data-demo-toggle]")).toHaveAttribute("aria-pressed", "true");
    await page.locator(".hero-scrub [data-demo-toggle]").press("Space");
    await expect.poll(() => paused(hero(page))).toBe(false);
    await context.close();
  });

  test("a rejected play() (NotAllowedError) shows the Play button; the first tap on the tile starts it", async ({ browser }) => {
    const { context, page } = await open(browser, { reject: true });
    await expect(page.locator(".hero-scrub [data-demo-toggle]")).toHaveText("Play demo");
    expect(await paused(hero(page))).toBe(true);
    await page.evaluate(() => ((window as unknown as { __rejectPlay: boolean }).__rejectPlay = false));
    await hero(page).click({ position: { x: 60, y: 60 } });
    await expect.poll(() => paused(hero(page))).toBe(false);
    await context.close();
  });

  test("walkthrough: opens with showModal, controls, EN + AR captions, 4-step stepper seeks, Esc closes and returns focus", async ({ browser }) => {
    const { context, page } = await open(browser);
    const watch = page.getByTestId("demo-watch");
    await expect(watch).toHaveText("Watch the full walkthrough (under a minute)");
    await watch.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("demo-walkthrough");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d: HTMLDialogElement) => d.open && d.matches(":modal"))).toBe(true);
    const video = dialog.locator("video");
    await expect(video).toHaveAttribute("controls", "");
    await expect(video).not.toHaveAttribute("loop", /.*/);
    await expect(video).not.toHaveAttribute("autoplay", /.*/);
    const tracks = await video.locator("track").evaluateAll((ts) => ts.map((t) => [t.getAttribute("kind"), t.getAttribute("srclang"), (t as HTMLTrackElement).default]));
    expect(tracks).toEqual([["captions", "en", true], ["captions", "ar", false]]);
    const steps = dialog.getByTestId("demo-stepper").locator("[data-chapter]");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
    await steps.nth(2).click();
    await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
    expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(25);
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
    await steps.nth(2).focus();
    await page.keyboard.press("ArrowRight"); // LTR: forward
    await expect(steps.nth(3)).toHaveAttribute("aria-current", "step");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(watch).toBeFocused();
    await context.close();
  });

  test("walkthrough, Arabic: Left/Right keys are flipped, Arabic captions are the default", async ({ browser }) => {
    const { context, page } = await open(browser, { locale: "ar" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByTestId("demo-watch").click();
    const dialog = page.getByTestId("demo-walkthrough");
    await expect(dialog.locator("video track[default]")).toHaveAttribute("srclang", "ar");
    const steps = dialog.getByTestId("demo-stepper").locator("[data-chapter]");
    await steps.nth(1).focus();
    await page.keyboard.press("ArrowLeft"); // RTL: Left is forward
    await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
    await page.keyboard.press("ArrowRight"); // RTL: Right is back
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await context.close();
  });

  test("walkthrough under reduced motion: the stepper shows the chapter stills with their text, no video request", async ({ browser }) => {
    const { context, page, videos } = await open(browser, { motion: false });
    await page.getByTestId("demo-watch").click();
    const dialog = page.getByTestId("demo-walkthrough");
    const still = dialog.getByTestId("demo-chapter-still");
    await expect(still.locator("img")).toHaveAttribute("src", /walkthrough\.en\.light\.ch1\./);
    await expect(still).toContainText("Start from a template");
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(still.locator("img")).toHaveAttribute("src", /walkthrough\.en\.light\.ch2\./);
    await expect(still).toContainText("Shape the steps");
    expect(videos(/./)).toEqual([]);
    await context.close();
  });

  test("bento: four tiles with spans, heading + line each, the honest note, started only when visible", async ({ browser }) => {
    const { context, page, videos } = await open(browser);
    const section = page.locator("#demo");
    await expect(section.getByRole("heading", { name: "See it in action", level: 2 })).toBeVisible();
    const tiles = section.locator("[data-demo-tile]");
    await expect(tiles).toHaveCount(4);
    await expect(tiles.locator("h3")).toHaveText(["Ready-made templates", "Build by dragging and connecting", "Run and follow every step", "A record of every run"]);
    await expect(tiles.nth(0)).toContainText("Start from an example that runs on sample data.");
    await expect(section).toContainText("Recorded in the app on sample data");
    expect(videos(/\/(templates|build|run|history)\./)).toEqual([]);
    await section.scrollIntoViewIfNeeded();
    await tiles.nth(3).scrollIntoViewIfNeeded();
    await expect.poll(() => videos(/\/templates\./).length).toBe(1);
    const w = (await tiles.evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().top)]))) as number[][];
    expect(w[0]![0]).toBeGreaterThan(w[1]![0]! * 1.8); // wide ≈ 2 columns, square = 1
    expect(w[3]![0]).toBeGreaterThan(w[2]![0]! * 1.8);
    await context.close();
  });

  test("bento on a phone: one column", async ({ browser }) => {
    const { context, page } = await open(browser, { width: 360 });
    const xs = await page.locator("#demo [data-demo-tile]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(1);
    await context.close();
  });

  for (const locale of ["en", "ar"] as const) {
    test(`${locale}: no horizontal overflow at 360/768/1024/1440, controls at the inline end`, async ({ browser }) => {
      for (const width of [360, 768, 1024, 1440]) {
        const { context, page } = await open(browser, { locale, width });
        await page.evaluate(() => document.getElementById("demo")?.scrollIntoView());
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${locale} ${width}`).toBeLessThanOrEqual(1);
        const b = (await page.locator(".hero-scrub [data-demo-toggle]").boundingBox())!;
        const v = (await hero(page).boundingBox())!;
        const nearEnd = locale === "ar" ? b.x - v.x < v.x + v.width - (b.x + b.width) : v.x + v.width - (b.x + b.width) < b.x - v.x;
        expect(nearEnd, `${locale} ${width}: toggle at the inline end`).toBe(true);
        await context.close();
      }
    });
  }

  test("Arabic: labels and the honest note come from the Arabic catalogue", async ({ browser }) => {
    const { context, page } = await open(browser, { locale: "ar" });
    await expect(page.locator("#demo")).toContainText("تسجيل حقيقي من داخل التطبيق على بيانات تجريبية");
    await expect(page.getByRole("heading", { name: "شاهده وهو يعمل", level: 2 })).toBeVisible();
    expect(await hero(page).getAttribute("poster")).toContain("hero.ar.light.poster.");
    await context.close();
  });
});

test.describe("without a manifest", () => {
  test("the page renders today's hero, no demo section, no console errors", async ({ browser }) => {
    const { context, page, requests, errors } = await open(browser, { demo: "off" });
    await expect(page.getByTestId("landing-hero-step-preview")).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);
    await expect(page.locator("#demo")).toHaveCount(0);
    await expect(page.getByTestId("demo-watch")).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe("served media", () => {
  // Real files exist once #99's media is in the tree; without them there is nothing to request, so this asserts nothing.
  const manifest = "public/media/demo/manifest.json";
  test("/media/demo/* is immutable and answers Range with 206", async ({ request }) => {
    test.skip(!existsSync(manifest), "public/media/demo/manifest.json is not in this tree yet (#99); headers are unit-tested in tests/unit/demo-media.test.ts");
    const m = JSON.parse(readFileSync(manifest, "utf8")) as { files: { kind: string; path: string }[] };
    const file = m.files.find((f) => f.kind === "video")!.path;
    const res = await request.get(`/media/demo/${file}`, { headers: { range: "bytes=0-1023" } });
    expect(res.status()).toBe(206);
    expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });
});
