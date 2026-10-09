import { test, type Browser } from "@e2e-dev/web";
import { expect } from "e2e";

// Landing demo media (#100, part of #96). The app reads public/media/demo/manifest.json on the server; #99 produces the real
// media. This test must not depend on it, so it uses the test-only cookie `fl_test_demo=fixture` (honoured only when the stack
// runs with FLOWLINE_ENV=test), which makes the server read e2e/fixtures/demo/manifest.json, and answers every /media/demo/*
// request itself (an empty body for videos and images, a one-cue file for captions). Playback is stubbed (Playwright builds lack H.264), so these checks are about WHEN the
// page asks for video, WHICH file it asks for, and what the visitor can operate. Reduced motion cannot be emulated by the
// e2e-army web engine; reduce / saveData / 2g / live toggling are covered by e2e/landing-demo.spec.ts.
const base = (app: { baseUrl?: string }) => process.env.E2E_ARMY_URL ?? app.baseUrl ?? "http://127.0.0.1:3000";
const VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nfixture\n";

/** Serves the fixture media and records every request; a stub player makes play/pause/seek deterministic. */
async function arm(browser: Browser, locale: "en" | "ar", url: string) {
  const hits: string[] = [];
  await browser.route("**/media/demo/**", async (route) => {
    const path = new URL(route.request.url).pathname;
    hits.push(path);
    if (path.endsWith(".vtt")) return route.fulfill({ status: 200, contentType: "text/vtt", body: VTT });
    return route.fulfill({ status: 200, contentType: path.endsWith(".mp4") ? "video/mp4" : "image/jpeg" });
  });
  await browser.addInitScript(() => {
    const w = window as unknown as { __played: string[] };
    w.__played = [];
    const proto = HTMLMediaElement.prototype;
    Object.defineProperty(proto, "paused", { configurable: true, get() { return (this as { __p?: boolean }).__p !== false; } });
    proto.play = function () { (this as { __p?: boolean }).__p = false; w.__played.push(this.currentSrc || this.getAttribute("src") || ""); this.dispatchEvent(new Event("play")); return Promise.resolve(); };
    proto.pause = function () { if ((this as { __p?: boolean }).__p === false) { (this as { __p?: boolean }).__p = true; this.dispatchEvent(new Event("pause")); } };
    Object.defineProperty(proto, "currentTime", { configurable: true, get() { return (this as { __t?: number }).__t ?? 0; }, set(v: number) { (this as { __t?: number }).__t = v; } });
    // Deterministic codec choice: AV1 is supported, smooth and power efficient.
    Object.defineProperty(navigator, "mediaCapabilities", { configurable: true, value: { decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: true }) } });
  });
  await browser.setCookies([{ url, name: "fl_locale", value: locale }, { url, name: "fl_test_demo", value: "fixture" }]);
  return hits;
}

test("@issue-100 AC1: the hero loop sits in the hero visual, starts muted after load, and downloads exactly one video file", { tags: ["feat:fl-landing"] }, async ({ app, browser }) => {
  const hits = await arm(browser, "en", base(app));
  await app.open("/");
  const hero = await browser.evaluate(() => {
    const v = document.querySelector(".hero-scrub video[data-demo-clip='hero']") as HTMLVideoElement | null;
    const link = document.querySelector("link[rel='preload'][as='image']") as HTMLLinkElement | null;
    return v && { autoplay: v.hasAttribute("autoplay"), preload: v.getAttribute("preload"), poster: v.getAttribute("poster"), w: v.getAttribute("width"), h: v.getAttribute("height"), label: v.getAttribute("aria-label"), preloaded: link?.getAttribute("href") };
  });
  expect(hero, "DemoVideo inside .hero-scrub").not.toBeNull();
  expect(hero?.autoplay).toBe(false);
  expect(hero?.preload).toBe("none");
  expect(hero?.poster).toContain("/media/demo/hero.en.light.poster.");
  expect(hero?.preloaded).toBe(hero?.poster); // the poster is the LCP element and is preloaded
  expect(hero?.w && hero?.h && hero?.label).toBeTruthy();
  await expect.poll(() => hits.filter((p) => /\/hero\..*\.mp4$/.test(p)).length).toBe(1);
  const chosen = hits.filter((p) => /\/hero\..*\.mp4$/.test(p));
  expect(chosen[0]).toContain(".av1."); // AV1 smooth + power efficient wins over H.264
  expect(await browser.evaluate(() => (document.querySelector("video[data-demo-clip='hero']") as HTMLVideoElement).muted)).toBe(true);
  expect(hits.some((p) => p.includes("/templates."))).toBe(false); // bento tiles below the fold are not fetched
});

test("@issue-100 AC3: a loop longer than 5 s has a keyboard-operable Pause/Play button of at least 44x44 px that sticks", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  const hits = await arm(browser, "en", base(app));
  await app.open("/");
  const pause = screen.getByRole("button", "Pause").first();
  await expect(pause).toBeVisible({ timeout: 15_000 });
  const size = await browser.evaluate(() => { const b = document.querySelector(".hero-scrub [data-demo-toggle]") as HTMLElement; const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), b.getAttribute("aria-pressed")]; });
  expect(size[0]).toBeGreaterThanOrEqual(44);
  expect(size[1]).toBeGreaterThanOrEqual(44);
  expect(size[2]).toBe("false");
  await pause.focus();
  await pause.press("Enter");
  await expect.poll(() => browser.evaluate(() => (document.querySelector("video[data-demo-clip='hero']") as HTMLVideoElement).paused)).toBe(true);
  await expect(screen.getByRole("button", "Play demo").first()).toBeVisible();
  expect(await browser.evaluate(() => document.querySelector(".hero-scrub [data-demo-toggle]")!.getAttribute("aria-pressed"))).toBe("true");
});

test("@issue-100 AC4: the walkthrough dialog opens from the button, steps through four chapters, flips its arrow keys in Arabic and closes with Esc", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  const hits = await arm(browser, "ar", base(app));
  await app.open("/");
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  const open = screen.getByTestId("demo-watch");
  await open.tap();
  await expect(screen.getByTestId("demo-walkthrough")).toBeVisible();
  const info = await browser.evaluate(() => {
    const d = document.querySelector("dialog[data-testid='demo-walkthrough']") as HTMLDialogElement;
    const v = d.querySelector("video") as HTMLVideoElement;
    return { open: d.open, controls: v.controls, tracks: [...v.querySelectorAll("track")].map((t) => [t.getAttribute("kind"), t.getAttribute("srclang"), (t as HTMLTrackElement).default]), steps: d.querySelectorAll("[data-testid='demo-stepper'] [data-chapter]").length };
  });
  expect(info.open).toBe(true);
  expect(info.controls).toBe(true);
  expect(info.tracks).toEqual([["captions", "ar", true], ["captions", "en", false]]);
  expect(info.steps).toBe(4);
  const current = () => browser.evaluate(() => document.querySelector("[data-testid='demo-stepper'] [aria-current='step']")?.getAttribute("data-chapter"));
  expect(await current()).toBe("templates");
  await browser.locator("[data-testid='demo-stepper'] [data-chapter='run']").tap();
  expect(await current()).toBe("run");
  expect(await browser.evaluate(() => (document.querySelector("dialog video") as HTMLVideoElement).currentTime)).toBe(25);
  await browser.locator("[data-testid='demo-stepper'] [data-chapter='run']").press("ArrowRight"); // RTL: ArrowRight goes BACK
  expect(await current()).toBe("shape");
  await browser.locator("[data-testid='demo-stepper'] [data-chapter='shape']").press("ArrowLeft"); // RTL: ArrowLeft goes FORWARD
  expect(await current()).toBe("run");
  await browser.locator("[data-testid='demo-stepper'] [data-chapter='run']").press("Escape");
  await expect(screen.getByTestId("demo-walkthrough")).toBeHidden();
  expect(await browser.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-testid"))).toBe("demo-watch");
  expect(hits.filter((p) => p.endsWith(".mp4") && p.includes("/walkthrough.")).length).toBeLessThanOrEqual(1);
});

test("@issue-100 AC5: the See it in action bento shows four tiles with one honest line each and starts them only when visible", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  const hits = await arm(browser, "en", base(app));
  await app.open("/");
  await expect(screen.getByRole("heading", "See it in action")).toBeVisible();
  const titles = await browser.evaluate(() => [...document.querySelectorAll("#demo [data-demo-tile]")].map((t) => [t.getAttribute("data-demo-tile"), t.querySelector("h3")?.textContent]));
  expect(titles).toEqual([["templates", "Ready-made templates"], ["build", "Build by dragging and connecting"], ["run", "Run and follow every step"], ["history", "A record of every run"]]);
  await expect(screen.getByText("Recorded in the app on sample data").first()).toBeVisible();
  expect(hits.filter((p) => /\/(templates|build|run|history)\..*\.mp4$/.test(p))).toEqual([]); // below the fold: nothing fetched yet
  await browser.evaluate(() => document.getElementById("demo")!.scrollIntoView());
  await expect.poll(() => hits.some((p) => /\/templates\..*\.mp4$/.test(p))).toBe(true);
});
