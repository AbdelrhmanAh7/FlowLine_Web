import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGET } from "../../scripts/demo/clips";
import { av1Args, encodeWithBudget, h264Args } from "../../scripts/demo/deliver";
import { codecString, parseProbe, psnrRgb, type Probe } from "../../scripts/demo/ffmpeg";
import { budgetReport, hashName, mergeManifest, staleFiles, validateManifest, writeManifest, readManifest, type Manifest, type ManifestFile } from "../../scripts/demo/manifest";

const fixture = (): Manifest => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/demo-manifest.json"), "utf8"));
// Mutable, untyped view of the fixture so tests can break it in arbitrary ways.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const bad = (mut: (m: Loose) => void) => {
  const m = fixture() as unknown as Loose;
  mut(m);
  return () => validateManifest(m);
};

describe("manifest schema", () => {
  it("validates the fixture", () => {
    expect(validateManifest(fixture()).files).toHaveLength(6);
  });
  it("rejects broken variants", () => {
    expect(bad((m) => (m.schema = 2))).toThrow(/schema/);
    expect(bad((m) => (m.generatedAt = "yesterday"))).toThrow(/generatedAt/);
    expect(bad((m) => (m.files[0].codec = "vp9"))).toThrow();
    expect(bad((m) => delete m.files[0].bitrate)).toThrow(/bitrate/);
    expect(bad((m) => (m.clips.hero.aspect = "1/1"))).toThrow(/aspect/);
    expect(bad((m) => (m.files[2].path = m.files[0].path))).toThrow(/duplicate path/);
    expect(bad((m) => (m.files[0].path = "dir/hero.ar.light.av1.3f9a1c2e.mp4"))).toThrow(/bare file name/);
    expect(bad((m) => (m.files[0].path = "hero.mp4"))).toThrow(/hashed pattern/);
    expect(bad((m) => (m.files[0].path = "hero.en.light.av1.3f9a1c2e.mp4"))).toThrow(/hashed pattern/);
    expect(bad((m) => delete m.clips.hero)).toThrow(/clip "hero" is not in clips/);
    expect(bad((m) => (m.files[5].chapter = "nope"))).toThrow(/chapter "nope"/);
    expect(bad((m) => (m.extra = 1))).toThrow();
  });
});

describe("hashName", () => {
  it("embeds the first 8 hex of the sha256", () => {
    // sha256("abc") = ba7816bf8f01cfea...
    expect(hashName("hero.ar.light.poster", "jpg", Buffer.from("abc"))).toBe("hero.ar.light.poster.ba7816bf.jpg");
  });
});

const file = (over: Partial<ManifestFile> & { path: string }): ManifestFile => ({ clip: "hero", locale: "ar", theme: "light", kind: "poster", bytes: 1000, ...over }) as ManifestFile;

describe("mergeManifest", () => {
  const update = (replace: { clip: "hero" | "build"; locale: "ar" | "en"; theme?: "light" | "dark" }[], files: ManifestFile[]) => ({
    clips: { hero: fixture().clips.hero! },
    files,
    replace,
    uiCommit: "abc1234",
    generatedAt: "2026-10-13T09:00:00Z",
    tooling: { playwright: "1.63.0", remotion: "4.0.534" },
  });

  it("replaces only the rebuilt slice and keeps the rest, sorted", () => {
    const old = validateManifest(fixture());
    const fresh = file({ path: "hero.ar.light.poster.deadbeef.jpg", bytes: 70000 });
    const m = mergeManifest(old, update([{ clip: "hero", locale: "ar", theme: "light" }], [fresh]));
    const paths = m.files.map((f) => f.path);
    expect(paths).not.toContain("hero.ar.light.av1.3f9a1c2e.mp4");
    expect(paths).not.toContain("hero.ar.light.poster.3f9a1c2e.jpg");
    expect(paths).toContain("hero.ar.light.poster.deadbeef.jpg");
    expect(paths).toContain("build.en.dark.av1.aa11bb22.mp4");
    expect(paths).toContain("walkthrough.ar.8c01d4aa.vtt");
    expect(m.uiCommit).toBe("abc1234");
    expect(Object.keys(m.clips)).toEqual(["hero", "build", "walkthrough"]);
    expect(m.files.map((f) => f.clip)).toEqual(["hero", "build", "walkthrough", "walkthrough"]);
  });

  it("a slice without theme also replaces the locale's captions; another theme is kept", () => {
    const old = validateManifest(fixture());
    const dark = file({ theme: "dark", path: "hero.ar.dark.poster.11111111.jpg" });
    const kept = mergeManifest(old, update([{ clip: "hero", locale: "ar", theme: "dark" }], [dark]));
    expect(kept.files.map((f) => f.path)).toContain("hero.ar.light.poster.3f9a1c2e.jpg");
    const m = mergeManifest(old, { ...update([{ clip: "hero", locale: "ar" }], [dark]), clips: { hero: old.clips.hero! } });
    expect(m.files.filter((f) => f.clip === "hero").map((f) => f.path)).toEqual(["hero.ar.dark.poster.11111111.jpg"]);
  });

  it("starts from nothing and validates the result", () => {
    const m = mergeManifest(null, update([], [file({ path: "hero.ar.light.poster.deadbeef.jpg" })]));
    expect(m.files).toHaveLength(1);
    expect(() => mergeManifest(null, update([], [file({ path: "nope.jpg" })]))).toThrow(/hashed pattern/);
  });
});

describe("budgetReport", () => {
  const MB = 1_000_000;
  const vid = (codec: "av1" | "h264", bytes: number, clip: "hero" | "walkthrough" = "hero"): ManifestFile => ({
    clip, locale: "ar", theme: "light", kind: "video", codec, type: "video/mp4", path: `${clip}.ar.light.${codec}.00000000.mp4`, bytes, sha256: "0".repeat(64), bitrate: 1,
  });
  it("is quiet for files within budget", () => {
    expect(budgetReport([vid("av1", 1.5 * MB), vid("h264", 3 * MB), file({ path: "hero.ar.light.poster.00000000.jpg", bytes: 60_000 })])).toEqual([]);
  });
  it("flags a 7 MB file, an over-target video, a 100 KB poster and a 70+ KB chapter still", () => {
    const p = budgetReport([
      vid("h264", 7 * MB, "walkthrough"),
      vid("av1", 1.7 * MB),
      file({ path: "hero.ar.light.poster.00000000.jpg", bytes: 100_000 }),
      file({ kind: "chapter-still", chapter: "run", path: "walkthrough.ar.light.ch1.00000000.jpg", clip: "walkthrough", bytes: 71_000 } as never),
    ]);
    expect(p.join("\n")).toMatch(/over the 6\.00 MB file cap/);
    expect(p.join("\n")).toMatch(/hero\.ar\.light\.av1.*over the 1\.60 MB av1 target/);
    expect(p.join("\n")).toMatch(/poster 100\.0 KB is over 90\.0 KB/);
    expect(p.join("\n")).toMatch(/chapter still 71\.0 KB is over 70\.0 KB/);
  });
  it("flags a 46 MB total", () => {
    const many = Array.from({ length: 12 }, (_, k) => ({ ...vid("h264", 3.9 * MB, "walkthrough"), path: `walkthrough.ar.light.h264.0000000${k % 10}.mp4` }));
    expect(budgetReport(many).some((x) => /total 46\.80 MB is over the 45\.00 MB/.test(x))).toBe(true);
  });
  it("with a dir checks real sizes and missing files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-budget-"));
    fs.writeFileSync(path.join(dir, "hero.ar.light.poster.00000000.jpg"), Buffer.alloc(10));
    const p = budgetReport([file({ path: "hero.ar.light.poster.00000000.jpg", bytes: 99 }), file({ path: "hero.ar.light.poster.11111111.jpg" })], dir);
    expect(p).toEqual(["hero.ar.light.poster.00000000.jpg: 10 bytes on disk, manifest says 99", expect.stringMatching(/missing from/)]);
  });
});

describe("manifest files on disk", () => {
  it("writes pretty JSON with a trailing newline, reads it back, lists stale files", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-manifest-"));
    const m = validateManifest(fixture());
    await writeManifest(dir, m);
    const raw = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
    expect(raw.endsWith("}\n")).toBe(true);
    expect(raw).toContain('\n  "schema": 1');
    expect(await readManifest(dir)).toEqual(m);
    fs.writeFileSync(path.join(dir, "hero.ar.light.av1.3f9a1c2e.mp4"), "x");
    fs.writeFileSync(path.join(dir, "old.ar.light.poster.deadbeef.jpg"), "x");
    fs.writeFileSync(path.join(dir, ".DS_Store"), "x");
    expect(await staleFiles(dir, m)).toEqual(["old.ar.light.poster.deadbeef.jpg"]);
  });
});

describe("encodeWithBudget", () => {
  const MB = 1_000_000;
  const run = (sizes: number[], psnr: number | number[] = 45, target = 3.2 * MB) => {
    const crfs: number[] = [];
    return {
      crfs,
      p: encodeWithBudget({
        encode: async (crf) => {
          crfs.push(crf);
          return { file: `out.crf${crf}.mp4`, bytes: sizes[crfs.length - 1]! };
        },
        psnr: async () => (Array.isArray(psnr) ? psnr[crfs.length - 1]! : psnr),
        target,
        crf: 25,
      }),
    };
  };

  it("accepts the first encode when it is within the target", async () => {
    const { p, crfs } = run([3 * MB]);
    expect(await p).toMatchObject({ file: "out.crf25.mp4", bytes: 3 * MB, crf: 25, psnr: 45, attempts: 1 });
    expect(crfs).toEqual([25]);
  });
  it("raises the crf until the file fits", async () => {
    const { p, crfs } = run([4 * MB, 3.5 * MB, 3.1 * MB]);
    expect(await p).toMatchObject({ crf: 29, attempts: 3, bytes: 3.1 * MB });
    expect(crfs).toEqual([25, 27, 29]);
  });
  it("throws a clear error after 3 tries over target", async () => {
    const { p, crfs } = run([4 * MB, 3.9 * MB, 3.4 * MB], 43.1);
    await expect(p).rejects.toThrow("out.crf29.mp4: 3.4 MB over the 3.2 MB target at crf 29 (PSNR 43.1 dB) after 3 tries");
    expect(crfs).toHaveLength(3);
  });
  it("throws when an accepted encode has PSNR below 42 dB", async () => {
    const { p } = run([3 * MB], 41.2);
    await expect(p).rejects.toThrow(/PSNR 41\.2 dB is below the 42 dB floor at crf 25/);
  });
  it("uses the budget constants by default", () => {
    expect(BUDGET.crf.tries).toBe(3);
  });
});

describe("encoder args and codec strings", () => {
  it("builds the documented ffmpeg args", () => {
    expect(h264Args("in.mp4", "o.mp4", 25, "4.2").join(" ")).toBe(
      "-v error -y -i in.mp4 -c:v libx264 -preset slower -crf 25 -tune animation -profile:v high -level:v 4.2 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart -an o.mp4",
    );
    expect(av1Args("in.mp4", "o.mp4", 36).join(" ")).toBe(
      "-v error -y -i in.mp4 -c:v libaom-av1 -b:v 0 -crf 36 -cpu-used 6 -row-mt 1 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart -an o.mp4",
    );
  });
  const probe = (over: Partial<Probe>): Probe => ({ width: 1920, height: 1080, fps: 60, durationS: 16, codec: "h264", profile: "High", level: 42, pixFmt: "yuv420p", colorSpace: "bt709", colorPrimaries: "bt709", colorTransfer: "bt709", hasAudio: false, bitrate: 1, ...over });
  it("derives RFC 6381 strings", () => {
    expect(codecString(probe({}))).toBe("avc1.64002A");
    expect(codecString(probe({ level: 40 }))).toBe("avc1.640028");
    expect(codecString(probe({ profile: "100" }))).toBe("avc1.64002A"); // Remotion's ffprobe reports profile_idc
    expect(codecString(probe({ codec: "av1", profile: "0", level: 8 }))).toBe("av01.0.08M.08");
    expect(codecString(probe({ codec: "av1", profile: "Main", level: 9 }))).toBe("av01.0.09M.08");
    expect(codecString(probe({ codec: "av1", profile: "Main", level: null }))).toBe("av01.0.09M.08");
    expect(codecString(probe({ codec: "av1", profile: "Main", level: null, width: 1280, height: 720, fps: 30 }))).toBe("av01.0.08M.08");
    expect(() => codecString(probe({ codec: "vp9" }))).toThrow(/unsupported/);
  });
  it("parses ffprobe json and psnr output", () => {
    const p = parseProbe(JSON.stringify({
      streams: [{ codec_type: "video", codec_name: "h264", profile: "High", level: 42, width: 1920, height: 1080, r_frame_rate: "60/1", pix_fmt: "yuv420p", color_space: "bt709", color_primaries: "bt709", color_transfer: "bt709" }],
      format: { duration: "16.016000", bit_rate: "1200000" },
    }));
    expect(p).toMatchObject({ fps: 60, durationS: 16.016, bitrate: 1200000, hasAudio: false, level: 42 });
    expect(psnrRgb(Uint8Array.of(10, 20, 30), Uint8Array.of(10, 20, 30))).toBe(99);
    expect(psnrRgb(Uint8Array.of(0, 0, 0, 0), Uint8Array.of(0, 0, 0, 255))).toBeCloseTo(6.02, 1);
    expect(() => psnrRgb(Uint8Array.of(1), Uint8Array.of(1, 2))).toThrow();
  });
});
