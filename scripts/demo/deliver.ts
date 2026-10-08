// Stage 4: composed master → delivered files. Encodes AV1 and H.264 with a size-budget loop, probes them, and copies
// every output into public/media/demo under a content-hashed name. The ffmpeg runner is injectable (see `Deps`).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Locale, Theme } from "../../tools/demo-video/src/props";
import { BUDGET, CLIPS, type ClipId } from "./clips";
import * as real from "./ffmpeg";
import { codecString, type Probe } from "./ffmpeg";
import { hashName, type ManifestFile } from "./manifest";

const COLOR_ARGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

export const h264Args = (input: string, out: string, crf: number, level: "4.2" | "4.0"): string[] => [
  "-v", "error", "-y", "-i", input,
  "-c:v", "libx264", "-preset", "slower", "-crf", String(crf), "-tune", "animation", "-profile:v", "high", "-level:v", level,
  "-pix_fmt", "yuv420p", ...COLOR_ARGS, "-movflags", "+faststart", "-an", out,
];

/** libaom through ffmpeg (never Remotion's own --codec=av1). */
export const av1Args = (input: string, out: string, crf: number): string[] => [
  "-v", "error", "-y", "-i", input,
  "-c:v", "libaom-av1", "-b:v", "0", "-crf", String(crf), "-cpu-used", "6", "-row-mt", "1",
  "-pix_fmt", "yuv420p", ...COLOR_ARGS, "-movflags", "+faststart", "-an", out,
];

export type Encoded = { file: string; bytes: number };
export type BudgetResult = Encoded & { crf: number; psnr: number; attempts: number };

export type BudgetOpts = {
  encode: (crf: number) => Promise<Encoded>;
  psnr: (file: string) => Promise<number>;
  /** Size target in bytes. */
  target: number;
  crf: number;
  step?: number;
  /** Maximum number of encodes (the first included). */
  tries?: number;
  minPsnr?: number;
};

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;

/** Encode at `crf`; raise it by `step` while over the target; every accepted encode must keep PSNR >= minPsnr. */
export async function encodeWithBudget(o: BudgetOpts): Promise<BudgetResult> {
  const { step = BUDGET.crf.step, tries = BUDGET.crf.tries, minPsnr = BUDGET.minPsnr } = o;
  let crf = o.crf;
  for (let attempts = 1; ; attempts++) {
    const enc = await o.encode(crf);
    if (enc.bytes <= o.target) {
      const psnr = await o.psnr(enc.file);
      if (psnr < minPsnr) throw new Error(`${enc.file}: PSNR ${psnr.toFixed(1)} dB is below the ${minPsnr} dB floor at crf ${crf} (${mb(enc.bytes)}, target ${mb(o.target)})`);
      return { ...enc, crf, psnr, attempts };
    }
    if (attempts >= tries) {
      const psnr = await o.psnr(enc.file);
      throw new Error(`${enc.file}: ${mb(enc.bytes)} over the ${mb(o.target)} target at crf ${crf} (PSNR ${psnr.toFixed(1)} dB) after ${attempts} tries`);
    }
    crf += step;
  }
}

/** Tools the deliver stage shells out to; tests replace them. */
export type Deps = {
  ffmpeg: (args: string[]) => Promise<unknown>;
  probe: (file: string) => Promise<Probe>;
  psnrAt: (a: string, b: string, times: number[]) => Promise<number>;
};
const realDeps: Deps = { ffmpeg: (a) => real.ffmpeg(a), probe: real.probe, psnrAt: real.psnrAt };

export type DeliverInput = {
  clip: ClipId;
  locale: Locale;
  theme: Theme;
  workDir: string;
  outDir: string;
  /** The Remotion output (lossless-ish intermediate). */
  composed: string;
  /** Poster JPEG. */
  poster: string;
  chapterStills?: { chapter: string; index: number; file: string }[];
  /** WebVTT: either the cue text itself (starts with "WEBVTT") or the path of a .vtt file. */
  vtt?: string;
};

/** Sample times: `n` evenly spaced points inside (0, duration). */
export const sampleTimes = (durationS: number, n = 6): number[] => Array.from({ length: n }, (_, k) => +((durationS * (k + 0.5)) / n).toFixed(3));

function assertDelivered(file: string, p: Probe, want: { w: number; h: number }) {
  const bad: string[] = [];
  if (p.hasAudio) bad.push("has an audio stream");
  if (p.pixFmt !== "yuv420p") bad.push(`pix_fmt ${p.pixFmt}`);
  for (const [k, v] of [["color_space", p.colorSpace], ["color_primaries", p.colorPrimaries], ["color_transfer", p.colorTransfer]] as const) if (v !== "bt709") bad.push(`${k} ${v || "unset"} (want bt709)`);
  if (p.width !== want.w || p.height !== want.h) bad.push(`${p.width}x${p.height} (want ${want.w}x${want.h})`);
  if (bad.length) throw new Error(`${file}: ${bad.join(", ")}`);
}

async function place(src: string, outDir: string, stem: string, ext: string) {
  const buf = await fs.readFile(src);
  const name = hashName(stem, ext, buf);
  await fs.copyFile(src, path.join(outDir, name));
  return { name, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

/** Encodes both codecs for one clip/locale/theme and returns the manifest entries of everything delivered. */
export async function deliverClip(i: DeliverInput, deps: Deps = realDeps): Promise<ManifestFile[]> {
  const spec = CLIPS[i.clip];
  await fs.mkdir(i.outDir, { recursive: true });
  const composed = await deps.probe(i.composed);
  const times = sampleTimes(composed.durationS);
  const stem = `${i.clip}.${i.locale}.${i.theme}`;
  const files: ManifestFile[] = [];

  for (const codec of ["av1", "h264"] as const) {
    const res = await encodeWithBudget({
      encode: async (crf) => {
        const out = path.join(i.workDir, `${stem}.${codec}.crf${crf}.mp4`);
        await deps.ffmpeg(codec === "av1" ? av1Args(i.composed, out, crf) : h264Args(i.composed, out, crf, spec.fps === 60 ? "4.2" : "4.0"));
        return { file: out, bytes: (await fs.stat(out)).size };
      },
      psnr: (file) => deps.psnrAt(i.composed, file, times),
      target: spec.target[codec],
      crf: BUDGET.crf[codec],
    });
    const p = await deps.probe(res.file);
    assertDelivered(res.file, p, { w: spec.canvas.w, h: spec.canvas.h });
    const placed = await place(res.file, i.outDir, `${stem}.${codec}`, "mp4");
    files.push({
      clip: i.clip, locale: i.locale, theme: i.theme, kind: "video", codec,
      type: `video/mp4; codecs="${codecString(p)}"`,
      path: placed.name, bytes: placed.bytes, sha256: placed.sha256,
      bitrate: p.bitrate > 0 ? Math.round(p.bitrate) : Math.round((placed.bytes * 8) / p.durationS),
    });
  }

  const poster = await place(i.poster, i.outDir, `${stem}.poster`, "jpg");
  files.push({ clip: i.clip, locale: i.locale, theme: i.theme, kind: "poster", path: poster.name, bytes: poster.bytes, sha256: poster.sha256 });

  for (const s of i.chapterStills ?? []) {
    const still = await place(s.file, i.outDir, `${stem}.ch${s.index}`, "jpg");
    files.push({ clip: i.clip, locale: i.locale, theme: i.theme, kind: "chapter-still", chapter: s.chapter, path: still.name, bytes: still.bytes });
  }

  if (i.vtt !== undefined) {
    const buf = i.vtt.startsWith("WEBVTT") ? Buffer.from(i.vtt, "utf8") : await fs.readFile(i.vtt);
    const name = hashName(`${i.clip}.${i.locale}`, "vtt", buf);
    await fs.writeFile(path.join(i.outDir, name), buf);
    files.push({ clip: i.clip, locale: i.locale, kind: "captions", lang: i.locale, path: name, bytes: buf.length });
  }
  return files;
}
