import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The recorded landing demo (`pnpm demo:record`, #96): every asset ≤ 6 MB and captions that fit a 30–60 s clip. */
const MEDIA = "public/media/flowline-demo";
const seconds = (ts: string) => ts.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);

describe("landing demo assets", () => {
  it.each(["mp4", "webm", "jpg", "en.vtt", "ar.vtt"])("flowline-demo.%s exists and is at most 6 MB", (ext) => {
    const size = statSync(`${MEDIA}.${ext}`).size;
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(6 * 1024 * 1024);
  });

  it("the EN and AR captions are valid WebVTT with the same, ordered cue times inside 0–60 s, ending after 30 s", () => {
    const cues = (lang: string) => {
      const vtt = readFileSync(`${MEDIA}.${lang}.vtt`, "utf8");
      expect(vtt.startsWith("WEBVTT\n")).toBe(true);
      return [...vtt.matchAll(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n(.+)$/gm)].map(([, a, b, text]) => ({ start: seconds(a), end: seconds(b), text }));
    };
    const en = cues("en");
    const ar = cues("ar");
    expect(en.length).toBeGreaterThanOrEqual(3);
    expect(ar.map(({ start, end }) => [start, end])).toEqual(en.map(({ start, end }) => [start, end]));
    en.forEach((c, i) => {
      expect(c.end).toBeGreaterThan(c.start);
      if (i) expect(c.start).toBeGreaterThanOrEqual(en[i - 1].end);
    });
    expect(en.at(-1)!.end).toBeGreaterThanOrEqual(30);
    expect(en.at(-1)!.end).toBeLessThanOrEqual(60);
    expect(ar.every((c) => /\p{Script=Arabic}/u.test(c.text))).toBe(true);
  });
});
