import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Landing demo video (#96 slice 1). Locator steps only (no model needed). Reduced motion cannot be emulated by the
// e2e-army web engine (docs: web.mdx "Limits"), so the poster + "Play demo" fallback is covered by e2e/landing-demo.spec.ts.
const base = (app: { baseUrl?: string }) => process.env.E2E_ARMY_URL ?? app.baseUrl ?? "http://127.0.0.1:3000";

test("@issue-96 AC1: the landing page shows a muted demo video with poster, mp4/webm sources and EN/AR captions", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  await browser.setCookies([{ url: base(app), name: "fl_locale", value: "en" }]);
  await app.open("/");
  await screen.getByTestId("demo-video").scrollIntoView();
  const info = await browser.evaluate(() => {
    const v = document.querySelector("video[data-testid='demo-video']") as HTMLVideoElement | null;
    return v && {
      poster: v.getAttribute("poster"),
      muted: v.muted,
      sources: [...v.querySelectorAll("source")].map((s) => s.getAttribute("type")),
      tracks: [...v.querySelectorAll("track")].map((t) => [t.getAttribute("srclang"), t.getAttribute("src")]),
    };
  });
  expect(info?.poster).toBe("/media/flowline-demo.jpg");
  expect(info?.muted).toBe(true);
  expect(info?.sources).toEqual(["video/mp4", "video/webm"]);
  expect(info?.tracks).toEqual([["en", "/media/flowline-demo.en.vtt"], ["ar", "/media/flowline-demo.ar.vtt"]]);
  // The assets are really served (not a dead player).
  for (const f of ["flowline-demo.jpg", "flowline-demo.mp4", "flowline-demo.webm", "flowline-demo.en.vtt", "flowline-demo.ar.vtt"]) {
    expect((await fetch(new URL(`/media/${f}`, base(app)), { method: "HEAD" })).status, f).toBe(200);
  }
  // Muted autoplay on desktop once the video is in view.
  await expect.poll(() => browser.evaluate(() => !(document.querySelector("video[data-testid='demo-video']") as HTMLVideoElement).paused), { timeout: 15_000 }).toBe(true);
});

test("@issue-96 AC2: the play/pause control works from the keyboard", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  await browser.setCookies([{ url: base(app), name: "fl_locale", value: "en" }]);
  await app.open("/");
  await screen.getByTestId("demo-video").scrollIntoView();
  const pause = screen.getByRole("button", "Pause demo");
  await expect(pause).toBeVisible({ timeout: 15_000 });
  await pause.focus();
  await pause.press("Enter");
  await expect.poll(() => browser.evaluate(() => (document.querySelector("video[data-testid='demo-video']") as HTMLVideoElement).paused)).toBe(true);
  const play = screen.getByRole("button", "Play demo");
  await expect(play).toBeVisible();
  await play.press(" ");
  await expect.poll(() => browser.evaluate(() => (document.querySelector("video[data-testid='demo-video']") as HTMLVideoElement).paused)).toBe(false);
});

test("@issue-96 AC3: the Arabic landing page is RTL, labels the control in Arabic and shows Arabic captions", { tags: ["feat:fl-landing"] }, async ({ app, screen, browser }) => {
  await browser.setCookies([{ url: base(app), name: "fl_locale", value: "ar" }]); // Arabic is also the default without the cookie
  await app.open("/");
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await screen.getByTestId("demo-video").scrollIntoView();
  await expect(screen.getByRole("button", /تشغيل العرض|إيقاف العرض/)).toBeVisible();
  const def = await browser.evaluate(() => [...document.querySelectorAll("video[data-testid='demo-video'] track")].filter((t) => (t as HTMLTrackElement).default).map((t) => t.getAttribute("srclang")));
  expect(def).toEqual(["ar"]);
});
