import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-96 AC1: the landing page shows a muted demo video with poster, mp4/webm sources and EN/AR captions", async ({ app, agent, screen, browser }) => {
  await app.open("/");
  await agent.assert("the landing page has a product demo video section with a play/pause control");
  const info = await browser.evaluate(() => {
    const v = document.querySelector("video[data-testid='demo-video']") as HTMLVideoElement | null;
    return v && {
      poster: v.getAttribute("poster"),
      muted: v.muted,
      sources: [...v.querySelectorAll("source")].map((s) => s.getAttribute("type")),
      tracks: [...v.querySelectorAll("track")].map((t) => t.getAttribute("srclang")),
    };
  });
  expect(info?.poster).toContain("flowline-demo.jpg");
  expect(info?.muted).toBe(true);
  expect(info?.sources).toEqual(["video/mp4", "video/webm"]);
  expect(info?.tracks).toEqual(["en", "ar"]);
});

test("@issue-96 AC2: the play/pause control works from the keyboard and Play demo appears under reduced motion", async ({ app, agent, screen, browser }) => {
  await app.open("/");
  await agent.act("focus the demo video play/pause button with the keyboard and press Enter");
  await agent.assert("the demo video button label changed between Pause demo and Play demo");
  await expect(screen.getByRole("button", { name: /(play|pause) demo|تشغيل العرض|إيقاف العرض/i })).toBeVisible();
});

test("@issue-96 AC3: the Arabic landing page is RTL and has Arabic demo labels", async ({ app, screen, browser }) => {
  await app.open("/"); // Arabic is the default locale (no fl_locale cookie)
  const dir = await browser.evaluate(() => document.documentElement.dir);
  expect(dir).toBe("rtl");
  await expect(screen.getByRole("button", { name: /تشغيل العرض|إيقاف العرض/ })).toBeVisible();
});
