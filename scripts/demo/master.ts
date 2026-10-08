// Stage 2: the recorder's variable-rate JPEG frames (frames.json: index + timestamp) become a constant 60 fps BT.709
// master. An ffconcat list carries the real inter-frame durations, `-fps_mode cfr -r 60` resamples them.
import fs from "node:fs/promises";
import path from "node:path";
import { ffmpeg } from "./ffmpeg";
import { parseEvents } from "./events";

export type FrameStamp = { i: number; t: number };

const defaultName = (i: number) => `frames/${String(i).padStart(6, "0")}.jpg`;
const dur = (s: number) => Math.max(0.001, s).toFixed(4);

/** ffconcat script: each frame shown until the next one's timestamp, the last until `duration`. */
export function buildFfconcat(frames: FrameStamp[], duration: number, nameOf: (i: number) => string = defaultName): string {
  if (frames.length === 0) throw new Error("buildFfconcat: no frames");
  for (let k = 1; k < frames.length; k++) {
    if (frames[k]!.t < frames[k - 1]!.t) throw new Error(`buildFfconcat: frames not sorted by time (frame ${frames[k]!.i} at ${frames[k]!.t}s follows ${frames[k - 1]!.t}s)`);
  }
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, k) => {
    const next = k + 1 < frames.length ? frames[k + 1]!.t : duration;
    lines.push(`file '${nameOf(f.i)}'`, `duration ${dur(next - f.t)}`);
  });
  // The concat demuxer ignores the duration of the final entry unless the file is repeated.
  lines.push(`file '${nameOf(frames[frames.length - 1]!.i)}'`);
  return lines.join("\n") + "\n";
}

/** ffmpeg args of stage 2 for a work directory. */
export function masterArgs(dir: string): string[] {
  return [
    "-v", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", `${dir}/frames.ffconcat`,
    "-fps_mode", "cfr", "-r", "60",
    "-vf", "scale=in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709",
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-movflags", "+faststart",
    `${dir}/master.mp4`,
  ];
}

/** Writes `<dir>/frames.ffconcat` from frames.json + events.json and encodes `<dir>/master.mp4`. */
export async function buildMaster(dir: string, run: (args: string[]) => Promise<unknown> = (a) => ffmpeg(a)): Promise<string> {
  // Screencast frames can be delivered a few ms out of order: play them in capture-time order.
  const frames = (JSON.parse(await fs.readFile(path.join(dir, "frames.json"), "utf8")) as FrameStamp[]).sort((a, b) => a.t - b.t || a.i - b.i);
  const events = parseEvents(await fs.readFile(path.join(dir, "events.json"), "utf8"));
  await fs.writeFile(path.join(dir, "frames.ffconcat"), buildFfconcat(frames, events.duration));
  await run(masterArgs(dir));
  return path.join(dir, "master.mp4");
}
