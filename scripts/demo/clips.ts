// The six landing demo clips, their canvas and their size budgets (issue #96 section 5). Pure data, shared by the
// recorder, the deliver stage, the manifest writer and `demo:verify`. Sizes are decimal (1 MB = 1 000 000 bytes).
import type { Locale, Shape, Theme } from "../../tools/demo-video/src/props";

export type ClipId = "hero" | "templates" | "build" | "run" | "history" | "walkthrough";
export const CLIP_IDS: ClipId[] = ["hero", "templates", "build", "run", "history", "walkthrough"];
export const LOCALES: Locale[] = ["ar", "en"];
export const THEMES: Theme[] = ["light", "dark"];

const MB = 1_000_000;
const KB = 1_000;

export type ClipSpec = {
  id: ClipId;
  shape: Shape;
  canvas: { w: number; h: number };
  fps: number;
  /** Storyboard length in seconds; a recording must land within ±15 %. */
  lengthS: number;
  loop: boolean;
  /** Target sizes per codec: over target, the deliver stage raises crf (max 3 tries) while PSNR stays >= 42 dB. */
  target: { av1: number; h264: number };
  /** Captions ship as WebVTT (walkthrough only); hero/tiles burn nothing in except the hero chips. */
  vtt: boolean;
};

export const CLIPS: Record<ClipId, ClipSpec> = {
  hero: { id: "hero", shape: "window", canvas: { w: 1920, h: 1080 }, fps: 60, lengthS: 16, loop: true, target: { av1: 1.6 * MB, h264: 3.2 * MB }, vtt: false },
  templates: { id: "templates", shape: "wide", canvas: { w: 1280, h: 720 }, fps: 30, lengthS: 7, loop: true, target: { av1: 0.45 * MB, h264: 0.9 * MB }, vtt: false },
  build: { id: "build", shape: "square", canvas: { w: 1080, h: 1080 }, fps: 30, lengthS: 8, loop: true, target: { av1: 0.5 * MB, h264: 1.0 * MB }, vtt: false },
  run: { id: "run", shape: "wide", canvas: { w: 1280, h: 720 }, fps: 30, lengthS: 7, loop: true, target: { av1: 0.45 * MB, h264: 0.9 * MB }, vtt: false },
  history: { id: "history", shape: "square", canvas: { w: 1080, h: 1080 }, fps: 30, lengthS: 6, loop: true, target: { av1: 0.4 * MB, h264: 0.8 * MB }, vtt: false },
  walkthrough: { id: "walkthrough", shape: "window", canvas: { w: 1920, h: 1080 }, fps: 60, lengthS: 53, loop: false, target: { av1: 4.5 * MB, h264: 6 * MB }, vtt: true },
};

export const BUDGET = {
  /** Every file in public/media/demo/. */
  fileCap: 6 * MB,
  /** The whole public/media/demo/ directory. */
  totalCap: 45 * MB,
  poster: 90 * KB,
  chapterStill: 70 * KB,
  /** Mean PSNR of a delivered encode against the composed master, at 6 sample times. */
  minPsnr: 42,
  /** Loop seam: last frame vs first frame. */
  minSeamPsnr: 35,
  /** Recorded length vs storyboard length. */
  lengthTolerance: 0.15,
  /** Decoded Run-button colour vs semantic.<theme>.accent, per channel. */
  accentTolerance: 6,
  crf: { av1: 36, h264: 25, step: 2, tries: 3 },
} as const;

/** Recording viewport (CSS px) and real device scale factor: 1280x720 at DPR 1.5 = 1920x1080 frames. */
export const VIEWPORT = { w: 1280, h: 720, dsf: 1.5 } as const;

/** Loop seam cross-dissolve, seconds (section 4: 0.9-1.1 s). */
export const DISSOLVE_S = 1.1;

/** Work directory of one clip build. */
export const workKey = (clip: ClipId, locale: Locale, theme: Theme) => `${clip}.${locale}.${theme}`;
