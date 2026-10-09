import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VideoSource } from "./demo-source";

export { chooseSource, shouldSkipVideo, startPlayback, type DecodeCaps, type VideoSource } from "./demo-source";

/**
 * Landing demo media manifest (#100, contract in #96 section 9). `public/media/demo/manifest.json` is written by the media
 * pipeline (#99); when it is missing or unreadable the landing page renders exactly as before (`readDemoManifest` returns null).
 * Server-side only (it reads the file system); the pure helpers the browser needs live in `demo-source.ts`.
 */
export const DEMO_BASE = "/media/demo/";
export const DEMO_DIR = join(process.cwd(), "public", "media", "demo");
/** Test stack only (FLOWLINE_ENV=test): `fl_test_demo=fixture` reads this folder instead, `off` ignores the real manifest. */
export const DEMO_FIXTURE_DIR = join(process.cwd(), "e2e", "fixtures", "demo");
export const DEMO_TEST_COOKIE = "fl_test_demo";

export type DemoLocale = "ar" | "en";
export type DemoTheme = "light" | "dark";
export type DemoFile = {
  clip: string;
  locale?: string;
  theme?: string;
  kind: "video" | "poster" | "captions" | "chapter-still";
  codec?: "av1" | "h264";
  type?: string;
  path: string;
  bytes?: number;
  bitrate?: number;
  lang?: string;
  chapter?: string;
};
export type DemoClip = { shape: string; aspect: string; width: number; height: number; fps: number; durationS: number; loop: boolean; chapters?: { id: string; t: number }[] };
export type DemoManifest = { schema: 1; generatedAt?: string; clips: Record<string, DemoClip>; files: DemoFile[] };

const KINDS = ["video", "poster", "captions", "chapter-still"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** A path is a plain file name: no folders, no traversal. */
const safePath = (p: unknown): p is string => typeof p === "string" && /^[\w.-]+$/.test(p) && !p.includes("..");

function parseClip(v: unknown): DemoClip | null {
  if (!isObj(v) || typeof v.aspect !== "string" || !num(v.width) || !num(v.height) || !num(v.fps) || !num(v.durationS)) return null;
  const chapters = Array.isArray(v.chapters)
    ? v.chapters.filter((c): c is { id: string; t: number } => isObj(c) && typeof c.id === "string" && num(c.t))
    : undefined;
  return { shape: String(v.shape ?? ""), aspect: v.aspect, width: v.width as number, height: v.height as number, fps: v.fps as number, durationS: v.durationS as number, loop: v.loop === true, ...(chapters ? { chapters } : {}) };
}

/** Validates the manifest contract (schema 1, a hero clip); malformed clips and files are dropped, anything else gives null. */
export function parseManifest(raw: unknown): DemoManifest | null {
  if (!isObj(raw) || raw.schema !== 1 || !isObj(raw.clips) || !Array.isArray(raw.files)) return null;
  const clips: Record<string, DemoClip> = {};
  for (const [id, c] of Object.entries(raw.clips)) {
    const clip = parseClip(c);
    if (clip) clips[id] = clip;
  }
  if (!clips.hero) return null;
  const files = raw.files.filter((f): f is DemoFile => isObj(f) && typeof f.clip === "string" && KINDS.includes(f.kind as string) && safePath(f.path));
  return { schema: 1, generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : undefined, clips, files };
}

/** The manifest in `dir` (default `public/media/demo`), or null when there is none yet or it is unreadable. */
export async function readDemoManifest(dir: string = DEMO_DIR): Promise<DemoManifest | null> {
  try {
    return parseManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
  } catch {
    return null;
  }
}

/** Which manifest this request uses: the real one, or (test stack only, by cookie) the fixtures / none. */
export async function demoManifestForRequest(cookieValue: string | undefined): Promise<DemoManifest | null> {
  if (process.env.FLOWLINE_ENV === "test") {
    if (cookieValue === "off") return null;
    if (cookieValue === "fixture") return readDemoManifest(DEMO_FIXTURE_DIR);
  }
  return readDemoManifest();
}

/**
 * One file of a clip. A dark theme without its own twin falls back to light; a locale without files falls back to Arabic (the
 * "EN uses the AR video" plan when the size cap would be exceeded). `codec` narrows videos, `chapter` narrows chapter stills.
 */
export function fileFor(m: DemoManifest, clip: string, locale: string, theme: string, kind: DemoFile["kind"] = "poster", extra?: string): DemoFile | undefined {
  const pick = (loc: string, th: string) =>
    m.files.find((f) => f.clip === clip && f.kind === kind && f.locale === loc && (f.theme ?? "light") === th && (kind === "video" ? f.codec === extra : kind === "chapter-still" ? f.chapter === extra : true));
  return pick(locale, theme) ?? pick(locale, "light") ?? pick("ar", theme) ?? pick("ar", "light");
}

export type ClipView = {
  clip: string;
  poster: { src: string; width: number; height: number };
  sources: VideoSource[];
  aspect: string;
  width: number;
  height: number;
  fps: number;
  durationS: number;
  loop: boolean;
};

/** Serialisable props for one clip (null when its poster or both videos are missing: the tile is then simply omitted). */
export function clipView(m: DemoManifest, clip: string, locale: DemoLocale, theme: DemoTheme): ClipView | null {
  const c = m.clips[clip];
  const poster = fileFor(m, clip, locale, theme, "poster");
  if (!c || !poster) return null;
  const sources: VideoSource[] = [];
  for (const codec of ["av1", "h264"] as const) {
    const f = fileFor(m, clip, locale, theme, "video", codec);
    if (f?.type) sources.push({ codec, type: f.type, src: DEMO_BASE + f.path, width: c.width, height: c.height, fps: c.fps, bitrate: f.bitrate ?? 0 });
  }
  if (!sources.length) return null;
  return { clip, poster: { src: DEMO_BASE + poster.path, width: c.width, height: c.height }, sources, aspect: c.aspect, width: c.width, height: c.height, fps: c.fps, durationS: c.durationS, loop: c.loop };
}

export type WalkthroughView = ClipView & { captions: Partial<Record<DemoLocale, string>>; chapters: { id: string; t: number; still?: string }[] };

/** The walkthrough: its video, an `ar` and an `en` caption track and four chapters with their stills (the no-playback fallback). */
export function walkthroughView(m: DemoManifest, locale: DemoLocale, theme: DemoTheme): WalkthroughView | null {
  const v = clipView(m, "walkthrough", locale, theme);
  const chapters = m.clips.walkthrough?.chapters;
  if (!v || !chapters?.length) return null;
  const captions: Partial<Record<DemoLocale, string>> = {};
  for (const lang of ["ar", "en"] as const) {
    const f = m.files.find((x) => x.clip === "walkthrough" && x.kind === "captions" && x.lang === lang);
    if (f) captions[lang] = DEMO_BASE + f.path;
  }
  return { ...v, captions, chapters: chapters.map((c) => { const s = fileFor(m, "walkthrough", locale, theme, "chapter-still", c.id); return { id: c.id, t: c.t, ...(s ? { still: DEMO_BASE + s.path } : {}) }; }) };
}
