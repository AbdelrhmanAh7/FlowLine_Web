import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deliverClip, sampleTimes, type Deps } from "../../scripts/demo/deliver";
import type { Probe } from "../../scripts/demo/ffmpeg";
import { validateManifest } from "../../scripts/demo/manifest";

const probeOf = (over: Partial<Probe> = {}): Probe => ({
  width: 1280, height: 720, fps: 30, durationS: 7, codec: "h264", profile: "High", level: 40, pixFmt: "yuv420p",
  colorSpace: "bt709", colorPrimaries: "bt709", colorTransfer: "bt709", hasAudio: false, bitrate: 500_000, ...over,
});

/** Fake ffmpeg: writes an output file whose size depends on the codec and crf; no real encoding. */
function fakeDeps(sizeOf: (codec: string, crf: number) => number, probes: Record<string, Partial<Probe>> = {}): Deps & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    ffmpeg: async (args) => {
      calls.push(args);
      const out = args[args.length - 1]!;
      const codec = args.includes("libaom-av1") ? "av1" : "h264";
      fs.writeFileSync(out, Buffer.alloc(sizeOf(codec, Number(args[args.indexOf("-crf") + 1])), codec));
    },
    probe: async (f) => (f.includes(".av1.") ? probeOf({ codec: "av1", profile: "Main", level: 8, ...probes.av1 }) : f.includes(".h264.") ? probeOf(probes.h264) : probeOf()),
    psnrAt: async () => 44,
  };
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-deliver-"));
  const workDir = path.join(dir, "work");
  fs.mkdirSync(workDir);
  fs.writeFileSync(path.join(dir, "composed.mp4"), "composed");
  fs.writeFileSync(path.join(dir, "poster.jpg"), "poster");
  return { dir, workDir, outDir: path.join(dir, "out"), composed: path.join(dir, "composed.mp4"), poster: path.join(dir, "poster.jpg") };
}

describe("deliverClip", () => {
  it("encodes both codecs, hashes the outputs and returns manifest entries", async () => {
    const s = setup();
    const deps = fakeDeps((codec, crf) => (codec === "av1" ? 300_000 : crf < 27 ? 1_000_000 : 800_000));
    const files = await deliverClip({ clip: "templates", locale: "en", theme: "dark", ...s, vtt: "WEBVTT\n\n" }, deps);
    expect(files.map((f) => f.kind)).toEqual(["video", "video", "poster", "captions"]);
    const [av1, h264] = files;
    expect(av1).toMatchObject({ codec: "av1", type: 'video/mp4; codecs="av01.0.08M.08"', bytes: 300_000, bitrate: 500_000 });
    expect(h264).toMatchObject({ codec: "h264", type: 'video/mp4; codecs="avc1.640028"', bytes: 800_000 }); // crf 25 → 27 once
    for (const f of files) expect(fs.existsSync(path.join(s.outDir, f.path))).toBe(true);
    // 30 fps clip → level 4.0
    expect(deps.calls.find((c) => c.includes("libx264"))).toContain("4.0");
    validateManifest({
      schema: 1, generatedAt: "2026-10-12T09:00:00Z", uiCommit: "abc1234", tooling: { playwright: "1", remotion: "1" },
      clips: { templates: { shape: "wide", aspect: "16/9", width: 1280, height: 720, fps: 30, durationS: 7, loop: true } }, files,
    });
  });

  it("fails when the encode is still over target after three tries", async () => {
    const s = setup();
    await expect(deliverClip({ clip: "templates", locale: "en", theme: "dark", ...s }, fakeDeps(() => 5_000_000))).rejects.toThrow(/over the 0\.5 MB target|over the .* MB target/);
  });

  it("rejects an encode with an audio stream or the wrong colour tags", async () => {
    const s = setup();
    const small = () => 100_000;
    await expect(deliverClip({ clip: "templates", locale: "en", theme: "dark", ...s }, fakeDeps(small, { av1: { hasAudio: true } }))).rejects.toThrow(/audio stream/);
    await expect(deliverClip({ clip: "templates", locale: "en", theme: "dark", ...s }, fakeDeps(small, { av1: { colorSpace: "" } }))).rejects.toThrow(/color_space unset/);
  });
});

describe("sampleTimes", () => {
  it("returns 6 evenly spaced times inside the clip", () => {
    const t = sampleTimes(12);
    expect(t).toEqual([1, 3, 5, 7, 9, 11]);
  });
});
