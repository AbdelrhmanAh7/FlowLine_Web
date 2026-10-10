import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { chooseSource, clipView, fileFor, parseManifest, readDemoManifest, shouldSkipVideo, startPlayback, walkthroughView, type VideoSource } from "@/lib/demo-media";
import fixture from "../../e2e/fixtures/demo/manifest.json";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";

const av1: VideoSource = { codec: "av1", type: 'video/mp4; codecs="av01.0.09M.08"', src: "/media/demo/hero.av1.mp4", width: 1920, height: 1080, fps: 60, bitrate: 600000 };
const h264: VideoSource = { codec: "h264", type: 'video/mp4; codecs="avc1.64002A"', src: "/media/demo/hero.h264.mp4", width: 1920, height: 1080, fps: 60, bitrate: 1200000 };
const caps = (by: Record<string, [boolean, boolean, boolean]>) => ({
  decodingInfo: async (c: { video: { contentType: string } }) => {
    const [supported, smooth, powerEfficient] = Object.entries(by).find(([k]) => c.video.contentType.includes(k))?.[1] ?? [false, false, false];
    return { supported, smooth, powerEfficient };
  },
});

describe("chooseSource (section 6 order)", () => {
  it("1) AV1 when supported, smooth and power efficient", async () => {
    expect(await chooseSource([h264, av1], caps({ av01: [true, true, true], avc1: [true, true, true] }))).toBe(av1);
  });
  it("2) H.264 when AV1 is not power efficient but H.264 is supported", async () => {
    expect(await chooseSource([av1, h264], caps({ av01: [true, true, false], avc1: [true, false, false] }))).toBe(h264);
  });
  it("3) software AV1 (supported and smooth) when H.264 is not supported", async () => {
    expect(await chooseSource([av1, h264], caps({ av01: [true, true, false], avc1: [false, false, false] }))).toBe(av1);
  });
  it("4) nothing when neither plays: the caller shows poster + Play", async () => {
    expect(await chooseSource([av1, h264], caps({ av01: [true, false, false], avc1: [false, false, false] }))).toBeNull();
    expect(await chooseSource([], caps({}))).toBeNull();
  });
  it("asks MediaCapabilities with the manifest's type, size, fps and bitrate", async () => {
    const decodingInfo = vi.fn(async () => ({ supported: true, smooth: true, powerEfficient: true }));
    await chooseSource([av1], { decodingInfo });
    expect(decodingInfo).toHaveBeenCalledWith({ type: "file", video: { contentType: av1.type, width: 1920, height: 1080, framerate: 60, bitrate: 600000 } });
  });
  it("a throwing decodingInfo counts as unsupported", async () => {
    const decodingInfo = async (c: { video: { contentType: string } }) => { if (c.video.contentType.includes("av01")) throw new TypeError("bad"); return { supported: true, smooth: true, powerEfficient: false }; };
    expect(await chooseSource([av1, h264], { decodingInfo })).toBe(h264);
  });
  it("without MediaCapabilities it falls back to canPlayType (H.264 first)", async () => {
    expect(await chooseSource([av1, h264], { canPlayType: (t) => (t.includes("avc1") ? "maybe" : "") })).toBe(h264);
    expect(await chooseSource([av1, h264], { canPlayType: (t) => (t.includes("av01") ? "probably" : "") })).toBe(av1);
    expect(await chooseSource([av1, h264], {})).toBeNull();
  });
});

describe("shouldSkipVideo", () => {
  it("skips for reduced motion, saveData and 2g", () => {
    expect(shouldSkipVideo(true, undefined)).toBe(true);
    expect(shouldSkipVideo(false, { saveData: true })).toBe(true);
    expect(shouldSkipVideo(false, { effectiveType: "2g" })).toBe(true);
    expect(shouldSkipVideo(false, { effectiveType: "slow-2g" })).toBe(true);
    expect(shouldSkipVideo(false, { effectiveType: "4g", saveData: false })).toBe(false);
    expect(shouldSkipVideo(false, undefined)).toBe(false);
  });
});

describe("startPlayback", () => {
  it("reports a rejected play() (iOS Low Power Mode, NotAllowedError) through the blocked handler", async () => {
    const onBlocked = vi.fn();
    const err = new DOMException("blocked", "NotAllowedError");
    expect(await startPlayback({ play: () => Promise.reject(err) }, onBlocked)).toBe(false);
    expect(onBlocked).toHaveBeenCalledWith(err);
  });
  it("is quiet when play() resolves or returns nothing (old browsers)", async () => {
    const onBlocked = vi.fn();
    expect(await startPlayback({ play: () => Promise.resolve() }, onBlocked)).toBe(true);
    expect(await startPlayback({ play: () => undefined }, onBlocked)).toBe(true);
    expect(onBlocked).not.toHaveBeenCalled();
  });
});

describe("manifest parsing", () => {
  it("accepts the fixture manifest", () => {
    const m = parseManifest(fixture)!;
    expect(m.schema).toBe(1);
    expect(Object.keys(m.clips)).toEqual(["hero", "templates", "build", "run", "history", "walkthrough"]);
    expect(m.clips.walkthrough!.chapters!.map((c) => c.id)).toEqual(["templates", "shape", "run", "inspect"]);
  });
  it("rejects anything that is not a schema-1 manifest with a hero clip", () => {
    for (const bad of [null, 1, "x", [], {}, { schema: 2, clips: {}, files: [] }, { schema: 1, clips: {}, files: [] }, { schema: 1, clips: { hero: {} }, files: [] }]) expect(parseManifest(bad)).toBeNull();
  });
  it("drops malformed files and files whose path escapes the media folder", () => {
    const m = parseManifest({ ...fixture, files: [...fixture.files, { clip: "hero", locale: "ar", kind: "poster", path: "../secret.jpg" }, { clip: "hero", kind: "poster" }, "x"] })!;
    expect(m.files.some((f) => f.path.includes(".."))).toBe(false);
    expect(m.files.length).toBe(fixture.files.length);
  });
  it("readDemoManifest returns null when the file is missing or broken, and the manifest when present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-"));
    try {
      expect(await readDemoManifest(dir)).toBeNull();
      writeFileSync(join(dir, "manifest.json"), "{ nope");
      expect(await readDemoManifest(dir)).toBeNull();
      writeFileSync(join(dir, "manifest.json"), JSON.stringify(fixture));
      expect((await readDemoManifest(dir))?.schema).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fileFor / views", () => {
  const m = parseManifest(fixture)!;
  it("picks by clip, locale, theme and kind", () => {
    expect(fileFor(m, "hero", "ar", "light", "poster")?.path).toBe("hero.ar.light.poster.fx000001.jpg");
    expect(fileFor(m, "hero", "en", "light", "video", "h264")?.type).toContain("avc1.64002A");
    expect(fileFor(m, "nope", "en", "light", "poster")).toBeUndefined();
  });
  it("falls back to light when the theme has no twin, and to Arabic when the locale has no files", () => {
    expect(fileFor(m, "hero", "en", "dark", "poster")?.theme).toBe("light");
    const noEn = { ...m, files: m.files.filter((f) => f.locale !== "en") };
    expect(fileFor(noEn, "hero", "en", "light", "poster")?.locale).toBe("ar");
  });
  it("clipView builds the serialisable props (poster, sources with absolute URLs, box)", () => {
    const v = clipView(m, "run", "en", "light")!;
    expect(v.poster.src).toBe("/media/demo/run.en.light.poster.fx000001.jpg");
    expect(v.sources.map((s) => s.codec)).toEqual(["av1", "h264"]);
    expect(v).toMatchObject({ aspect: "16/9", width: 1280, height: 720, fps: 30, durationS: 7, loop: true });
    expect(clipView(m, "missing", "en", "light")).toBeNull();
    expect(clipView({ ...m, files: m.files.filter((f) => f.kind !== "poster") }, "run", "en", "light")).toBeNull();
  });
  it("walkthroughView adds captions per language and chapter stills", () => {
    const v = walkthroughView(m, "ar", "light")!;
    expect(v.captions).toEqual({ ar: "/media/demo/walkthrough.ar.fx000001.vtt", en: "/media/demo/walkthrough.en.fx000001.vtt" });
    expect(v.chapters.map((c) => [c.id, c.t, c.still?.split("/").pop()])).toEqual([
      ["templates", 0, "walkthrough.ar.light.ch1.fx000001.jpg"], ["shape", 12, "walkthrough.ar.light.ch2.fx000001.jpg"],
      ["run", 25, "walkthrough.ar.light.ch3.fx000001.jpg"], ["inspect", 38, "walkthrough.ar.light.ch4.fx000001.jpg"],
    ]);
  });
});

describe("delivery and copy", () => {
  it("next.config.ts serves /media/demo/* as immutable", async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === "/media/demo/:path*");
    expect(rule?.headers).toEqual(expect.arrayContaining([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]));
  });
  it("landing.demo keys are identical in ar.json and en.json and nothing is empty", () => {
    const flat = (o: unknown, p = ""): string[] => (typeof o === "string" ? [p] : Object.entries(o as object).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)));
    const a = flat((ar as { landing: { demo: unknown } }).landing.demo).sort();
    expect(a).toEqual(flat((en as { landing: { demo: unknown } }).landing.demo).sort());
    expect(a).toHaveLength(23);
  });
});
