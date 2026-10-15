// Thin wrapper around the pinned ffmpeg/ffprobe that Remotion bundles (libx264 + libaom-av1). Every stage of the demo
// pipeline shells out through here, so the binary, `nice` and error format live in one place.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Remotion CLI in tools/demo-video: `remotion ffmpeg|ffprobe <args>` runs the bundled binaries. */
export const REMOTION_BIN = fileURLToPath(new URL("../../tools/demo-video/node_modules/.bin/remotion", import.meta.url));

/** Remotion checks its peer versions against the cwd's node_modules, so the tools run from their own package. */
const TOOL_DIR = fileURLToPath(new URL("../../tools/demo-video/", import.meta.url));

export type RunResult = { stdout: string; stderr: string; raw: Buffer };
export type RunOpts = { cwd?: string };

const TAIL = 2_000;

function run(tool: "ffmpeg" | "ffprobe", args: string[], opts: RunOpts = {}): Promise<RunResult> {
  const nice = process.platform !== "win32";
  const cmd = nice ? "nice" : REMOTION_BIN;
  const argv = [...(nice ? ["-n", "10", REMOTION_BIN] : []), tool, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd: opts.cwd ?? TOOL_DIR, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e) => reject(new Error(`${tool}: cannot start ${cmd}: ${e.message}`)));
    child.on("close", (code) => {
      const raw = Buffer.concat(chunks);
      if (code === 0) resolve({ stdout: raw.toString("utf8"), stderr, raw });
      else reject(new Error(`${tool} exited with ${code}: ${stderr.slice(-TAIL).trim()}`));
    });
  });
}

export const ffmpeg = (args: string[], opts?: RunOpts) => run("ffmpeg", args, opts);
export const ffprobe = (args: string[], opts?: RunOpts) => run("ffprobe", args, opts);

export type Probe = {
  width: number;
  height: number;
  fps: number;
  durationS: number;
  codec: string;
  profile: string;
  level: number | null;
  pixFmt: string;
  colorSpace: string;
  colorPrimaries: string;
  colorTransfer: string;
  hasAudio: boolean;
  /** Container bit rate, bits per second. */
  bitrate: number;
};

type Stream = Record<string, string | number | undefined>;

/** "60/1" or "30000/1001" → fps. */
export function parseRate(r: string | undefined): number {
  const m = /^(\d+)\/(\d+)$/.exec(r ?? "");
  if (!m || Number(m[2]) === 0) return 0;
  return Number(m[1]) / Number(m[2]);
}

/** Pure part of `probe`: ffprobe `-of json` output → Probe. */
export function parseProbe(json: string): Probe {
  const data = JSON.parse(json) as { streams?: Stream[]; format?: Record<string, string | undefined> };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("probe: no video stream");
  const level = Number(v.level);
  return {
    width: Number(v.width),
    height: Number(v.height),
    fps: parseRate(String(v.r_frame_rate ?? "")),
    durationS: Number(data.format?.duration ?? v.duration ?? 0),
    codec: String(v.codec_name ?? ""),
    profile: String(v.profile ?? ""),
    level: Number.isFinite(level) && level > 0 ? level : null,
    pixFmt: String(v.pix_fmt ?? ""),
    colorSpace: String(v.color_space ?? ""),
    colorPrimaries: String(v.color_primaries ?? ""),
    colorTransfer: String(v.color_transfer ?? ""),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
    bitrate: Number(data.format?.bit_rate ?? v.bit_rate ?? 0),
  };
}

export async function probe(file: string): Promise<Probe> {
  const { stdout } = await ffprobe(["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  return parseProbe(stdout);
}

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

/** RFC 6381 codec string for the `type` attribute: `avc1.PPCCLL` (H.264) or `av01.P.LLT.DD` (AV1, 8 bit). */
export function codecString(p: Probe): string {
  if (p.codec === "h264") {
    // Remotion's minimal ffprobe reports profile_idc as a number ("100" = High); a full build reports the name.
    const profileIdc = /^\d+$/.test(p.profile) ? Number(p.profile) : { baseline: 0x42, "constrained baseline": 0x42, main: 0x4d, extended: 0x58, high: 0x64 }[p.profile.toLowerCase()];
    if (profileIdc === undefined) throw new Error(`codecString: unsupported H.264 profile "${p.profile}"`);
    if (p.level === null) throw new Error("codecString: ffprobe reported no H.264 level");
    return `avc1.${hex2(profileIdc)}00${hex2(p.level)}`;
  }
  if (p.codec === "av1") {
    const profile = /^\d+$/.test(p.profile) ? Number(p.profile) : ({ main: 0, high: 1, professional: 2 }[p.profile.toLowerCase()] ?? 0);
    // ffprobe reports seq_level_idx; when it is missing, derive the level from the picture rate (4.0 = 08, 4.1 = 09).
    const idx = p.level !== null && p.level <= 31 ? p.level : p.width * p.height * p.fps > 1920 * 1080 * 30 ? 9 : 8;
    return `av01.${profile}.${String(idx).padStart(2, "0")}M.08`;
  }
  throw new Error(`codecString: unsupported codec "${p.codec}"`);
}

/**
 * YUV → RGB the way a browser shows our files (BT.709 matrix, limited range), with accurate rounding: ffmpeg's default
 * conversion is off by up to 2 levels, which matters for the ±6 accent check.
 */
export const DECODE_709 = ["-vf", "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24"];

/** PSNR (dB) of two same-sized 8-bit buffers; identical buffers read 99 dB. */
export function psnrRgb(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) throw new Error(`psnr: size mismatch (${a.length} vs ${b.length})`);
  let se = 0;
  for (let i = 0; i < a.length; i++) se += (a[i]! - b[i]!) ** 2;
  const mse = se / a.length;
  return mse === 0 ? 99 : Math.min(99, 10 * Math.log10((255 * 255) / mse));
}

/**
 * The frame at time `t` decoded to raw RGB (the bundled ffmpeg is minimal: no psnr filter and no rawvideo muxer, so the
 * frame goes through a PNG pipe and sharp, and PSNR is computed here).
 */
export async function frameRgb(video: string, t: number): Promise<Buffer> {
  const { raw } = await ffmpeg(["-v", "error", "-ss", t.toFixed(3), "-i", path.resolve(video), "-frames:v", "1", ...DECODE_709, "-f", "image2pipe", "-c:v", "png", "-"]);
  const { default: sharp } = await import("sharp");
  return sharp(raw).removeAlpha().raw().toBuffer();
}

/** PSNR (dB) of the frame decoded at each time `t`, comparing two files of the same size. */
export async function psnrPerTime(a: string, b: string, times: number[]): Promise<number[]> {
  const out: number[] = [];
  for (const t of times) out.push(psnrRgb(await frameRgb(a, t), await frameRgb(b, t)));
  return out;
}

export async function psnrAt(a: string, b: string, times: number[]): Promise<number> {
  const per = await psnrPerTime(a, b, times);
  return per.reduce((s, x) => s + x, 0) / per.length;
}

/** Decode the frame at time `t` (seconds) to a PNG. */
export async function extractFrame(video: string, t: number, outPng: string): Promise<void> {
  await ffmpeg(["-v", "error", "-y", "-ss", t.toFixed(3), "-i", path.resolve(video), "-frames:v", "1", ...DECODE_709, path.resolve(outPng)]);
}
