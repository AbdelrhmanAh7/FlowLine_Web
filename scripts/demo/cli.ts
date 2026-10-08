// `pnpm demo:doctor | demo:build | demo:verify` — the landing demo media pipeline (docs/landing/DEMO_MEDIA.md).
// build: isolated stack → seed → record (real UI, real DPR) → master (CFR 60, BT.709) → compose (Remotion) →
// deliver (AV1 + H.264 + poster [+ chapter stills, WebVTT]) → public/media/demo/ + manifest.json. Local only, never CI.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import type { DemoProps, EventsFile, Locale, Theme } from "../../tools/demo-video/src/props";
import { formatNumber } from "../../src/i18n/format";
import { BUDGET, CLIP_IDS, CLIPS, DISSOLVE_S, LOCALES, THEMES, VIEWPORT, workKey, type ClipId } from "./clips";
import { deliverClip } from "./deliver";
import { doctor } from "./doctor";
import { parseEvents } from "./events";
import { probe } from "./ffmpeg";
import { mergeManifest, readManifest, staleFiles, writeManifest, type ClipEntry, type Manifest, type ManifestFile, type Slice } from "./manifest";
import { buildMaster } from "./master";
import { msg, type Scenario } from "./scenarios/common";
import { loadStoryboard, missingBeats, resolveStoryboard, type ResolvedStoryboard } from "./storyboard";
import { writeVtt } from "./vtt";
import { LOCK, OUT, ROOT, TOOL, WORK, lockHeld, themeTokens } from "./paths";
import { checkAccent, verify } from "./verify";

const REMOTION = join(TOOL, "node_modules/.bin/remotion");

type Flags = { only: ClipId[]; locales: Locale[]; themes: Theme[]; skipRecord: boolean; skipRender: boolean; concurrency: number; rebuild: boolean };

export function parseFlags(argv: string[]): Flags {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  };
  const only = (get("only") ?? CLIP_IDS.join(",")).split(",").map((s) => s.trim()) as ClipId[];
  for (const c of only) if (!CLIP_IDS.includes(c)) throw new Error(`--only: unknown clip "${c}" (one of ${CLIP_IDS.join(", ")})`);
  const pick = <T extends string>(v: string | undefined, all: T[], dflt: T[]): T[] => (!v ? dflt : v === "all" ? all : v.split(",").map((s) => s as T));
  const locales = pick(get("locale"), LOCALES, LOCALES);
  const themes = pick(get("theme"), THEMES, ["light"]);
  for (const l of locales) if (!LOCALES.includes(l)) throw new Error(`--locale: "${l}" is not ar, en or all`);
  for (const t of themes) if (!THEMES.includes(t)) throw new Error(`--theme: "${t}" is not light, dark or all`);
  const concurrency = Number(get("concurrency") ?? 2);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("--concurrency must be 1-8");
  return { only, locales, themes, skipRecord: argv.includes("--skip-record") || argv.includes("--skip-render"), skipRender: argv.includes("--skip-render"), concurrency, rebuild: argv.includes("--rebuild") };
}

/** The app's own @fontsource files (OFL), copied into the compositor's public/fonts for a render. */
const FONTS = [
  { family: "IBM Plex Sans Arabic", weight: "600", src: "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2" },
  { family: "IBM Plex Sans Arabic", weight: "600", src: "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2" },
  { family: "IBM Plex Sans Arabic", weight: "400", src: "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2" },
  { family: "Inter Variable", weight: "100 900", src: "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2" },
];

function run(cmd: string, args: string[], cwd = ROOT): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(process.platform === "win32" ? cmd : "nice", process.platform === "win32" ? args : ["-n", "10", cmd, ...args], { cwd, stdio: ["ignore", "inherit", "pipe"] });
    let err = "";
    p.stderr.on("data", (b: Buffer) => {
      const s = b.toString();
      if (!/Version mismatch|zod/.test(s)) err += s;
    });
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.slice(0, 3).join(" ")} … failed (${code}): ${err.slice(-1500)}`))));
  });
}

const log = (s: string) => console.log(`[demo] ${s}`);

async function scenarios(): Promise<Record<ClipId, Scenario>> {
  const [{ hero }, { templates }, { build }, { run: runClip }, { history }, { walkthrough }] = await Promise.all([
    import("./scenarios/hero"),
    import("./scenarios/templates"),
    import("./scenarios/build"),
    import("./scenarios/run"),
    import("./scenarios/history"),
    import("./scenarios/walkthrough"),
  ]);
  return { hero, templates, build, run: runClip, history, walkthrough };
}

/** Records one clip into `dir` (frames/, frames.json, events.json, scene.json); retried by the caller. */
async function record(browser: Browser, url: string, scenario: Scenario, locale: Locale, theme: Theme, dir: string): Promise<EventsFile> {
  const { seed } = await import("./seed");
  const { Recorder, installGuard } = await import("./kit");
  const seeded = await seed(browser, url, locale, { history: scenario.id === "history" });
  const ctx = await browser.newContext({ baseURL: url, viewport: null, storageState: seeded.storageState, reducedMotion: "no-preference", colorScheme: theme });
  try {
    await ctx.addCookies([
      { name: "fl_locale", value: locale, url },
      { name: "fl_theme", value: theme, url },
    ]);
    const page = await ctx.newPage();
    await installGuard(page);
    const t = (key: string, vars?: Record<string, string | number>) => msg(locale, key, vars);
    await page.goto(scenario.start(seeded));
    await scenario.ready({ page, locale, seeded, t });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(VIEWPORT.w / 2, VIEWPORT.h / 2);
    await page.waitForTimeout(400); // settle entrance animations before the first frame
    const rec = new Recorder(page, { dir, locale, theme });
    await rec.start();
    try {
      await scenario.run({ page, rec, locale, seeded, t });
    } catch (e) {
      // Keep what the page looked like for the troubleshooting section of docs/landing/DEMO_MEDIA.md.
      await page.screenshot({ path: join(dir, "failure.png") }).catch(() => {});
      throw new Error(`${(e as Error).message.split("\n").slice(0, 3).join(" | ")} (at ${rec.now().toFixed(1)} s; screenshot ${join(dir, "failure.png").replace(`${ROOT}/`, "")})`);
    }
    return await rec.stop();
  } finally {
    await ctx.close();
  }
}

/** Fails a recording that strays more than ±15 % from its storyboard length or misses a storyboard beat. */
async function checkRecording(clip: ClipId, ev: EventsFile) {
  const spec = CLIPS[clip];
  const off = Math.abs(ev.duration - spec.lengthS) / spec.lengthS;
  if (off > BUDGET.lengthTolerance) throw new Error(`${clip}: recorded ${ev.duration.toFixed(2)} s, storyboard ${spec.lengthS} s (±${BUDGET.lengthTolerance * 100}% allowed)`);
  const missing = missingBeats(await loadStoryboard(clip), ev);
  if (missing.length) throw new Error(`${clip}: missing storyboard beats ${missing.join(", ")}`);
}

/** props.json for the composition (storyboard resolved against the recorded beats, tokens, fonts). */
export function buildProps(clip: ClipId, locale: Locale, theme: Theme, ev: EventsFile, sb: ResolvedStoryboard, base: { cx: number; cy: number } | null, src: string): DemoProps {
  const spec = CLIPS[clip];
  return {
    src,
    clip,
    shape: spec.shape,
    locale,
    theme,
    fps: spec.fps,
    canvas: spec.canvas,
    durationS: ev.duration,
    loop: spec.loop,
    dissolveS: DISSOLVE_S,
    tokens: themeTokens(theme),
    fonts: FONTS.map((f) => ({ family: f.family, weight: f.weight, file: f.src.split("/").pop()! })),
    data: ev,
    captions: spec.vtt ? [] : sb.captions, // the walkthrough's captions ship as WebVTT, not burned in
    chips: sb.chips,
    chapters: sb.chapters,
    endCard: sb.endCard,
    ...(base ? { base } : {}),
  };
}

async function buildOne(clip: ClipId, locale: Locale, theme: Theme, flags: Flags, rec: ((dir: string) => Promise<EventsFile>) | null) {
  const key = workKey(clip, locale, theme);
  const dir = join(WORK, key);
  const t0 = Date.now();
  mkdirSync(dir, { recursive: true });
  let ev: EventsFile;
  if (rec) {
    for (let attempt = 1; ; attempt++) {
      try {
        ev = await rec(dir);
        await checkRecording(clip, ev);
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        log(`${key}: recording attempt ${attempt} failed (${(e as Error).message.split("\n")[0]}); retrying`);
      }
    }
    log(`${key}: recorded ${ev.duration.toFixed(2)} s`);
  } else {
    if (!existsSync(join(dir, "events.json"))) throw new Error(`${key}: --skip-record but ${dir}/events.json is missing`);
    ev = parseEvents(JSON.parse(readFileSync(join(dir, "events.json"), "utf8")));
  }
  await buildMaster(dir);

  const sbRaw = await loadStoryboard(clip);
  const sb = resolveStoryboard(sbRaw, ev, locale, { formatNumber: (n) => formatNumber(locale, n), badge: msg(locale, "landing.badge") });
  const scene = existsSync(join(dir, "scene.json")) ? JSON.parse(readFileSync(join(dir, "scene.json"), "utf8")) : { base: null };
  // The compositor reads the master and fonts from its own public/ dir (removed after the render).
  const pub = join(TOOL, "public");
  mkdirSync(join(pub, "fonts"), { recursive: true });
  mkdirSync(join(pub, key), { recursive: true });
  for (const f of FONTS) copyFileSync(join(ROOT, "node_modules", f.src), join(pub, "fonts", f.src.split("/").pop()!));
  copyFileSync(join(dir, "master.mp4"), join(pub, key, "master.mp4"));
  const props = buildProps(clip, locale, theme, ev, sb, scene.base, `${key}/master.mp4`);
  writeFileSync(join(dir, "props.json"), JSON.stringify(props));
  writeFileSync(join(dir, "props.poster.json"), JSON.stringify({ ...props, poster: true }));
  const spec = CLIPS[clip];
  try {
    const composed = join(dir, "composed.mp4");
    if (!flags.skipRender || !existsSync(composed)) await run(REMOTION, ["render", "src/index.ts", "Demo", composed, `--props=${join(dir, "props.json")}`, "--codec=h264", "--crf=12", "--x264-preset=medium", "--color-space=bt709", "--image-format=png", `--concurrency=${flags.concurrency}`, "--muted", "--log=error"], TOOL);
    const still = async (out: string, t: number, scale = 1) =>
      run(REMOTION, ["still", "src/index.ts", "Demo", out, `--frame=${Math.min(Math.round(t * spec.fps), Math.round(ev.duration * spec.fps) - 1)}`, `--props=${join(dir, "props.poster.json")}`, "--image-format=jpeg", "--jpeg-quality=82", `--scale=${scale}`, "--log=error"], TOOL);
    const poster = join(dir, "poster.jpg");
    if (!flags.skipRender || !existsSync(poster)) await still(poster, sb.posterT);
    await fitJpeg(poster, BUDGET.poster);
    // Chapter stills (walkthrough): a clean frame of each chapter's result (storyboard `still`), 1280x720 to stay inside 70 KB.
    const chapterStills: { chapter: string; index: number; file: string }[] = [];
    for (const [i, c] of sb.chapterMarks.entries()) {
      const file = join(dir, `chapter${i + 1}.jpg`);
      if (!flags.skipRender || !existsSync(file)) await still(file, c.stillT, 2 / 3);
      await fitJpeg(file, BUDGET.chapterStill);
      chapterStills.push({ chapter: c.id, index: i + 1, file });
    }
    if (clip === "hero") await checkAccent(join(dir, "composed.mp4"), ev, props);
    const vtt = spec.vtt ? writeVtt(sb.captions, locale) : undefined;
    const files = await deliverClip({ clip, locale, theme, workDir: dir, outDir: OUT, composed, poster, chapterStills, vtt });
    const p = await probe(composed);
    const entry: ClipEntry = {
      shape: spec.shape,
      aspect: spec.shape === "square" ? "1/1" : "16/9",
      width: spec.canvas.w,
      height: spec.canvas.h,
      fps: spec.fps,
      durationS: Math.round(p.durationS * 100) / 100,
      loop: spec.loop,
      ...(sb.chapterMarks.length ? { chapters: sb.chapterMarks.map((c) => ({ id: c.id, t: Math.round(c.t * 100) / 100 })) } : {}),
    } as ClipEntry;
    log(`${key}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s (${files.map((f) => `${f.path} ${(f.bytes / 1000).toFixed(0)} KB`).join(", ")})`);
    return { entry, files, slice: { clip, locale, theme } as Slice };
  } finally {
    rmSync(join(pub, key), { recursive: true, force: true });
  }
}

/** Re-encodes a JPEG at lower quality until it fits `max` bytes (posters <= 90 KB, chapter stills <= 70 KB). */
async function fitJpeg(file: string, max: number) {
  const { default: sharp } = await import("sharp");
  const src = readFileSync(file);
  if (src.length <= max) return;
  for (let q = 78; q >= 50; q -= 4) {
    const out = await sharp(src).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (out.length <= max) return writeFileSync(file, out);
  }
  throw new Error(`${file}: still over ${max / 1000} KB at JPEG quality 50`);
}

function gitHead(): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
}

function toolVersion(pkg: string, base: string): string {
  return JSON.parse(readFileSync(join(base, "node_modules", pkg, "package.json"), "utf8")).version;
}

async function build(argv: string[]) {
  const flags = parseFlags(argv);
  const held = lockHeld();
  if (held) throw new Error(`another demo build is running (pid ${held}); wait for it (lock ${LOCK})`);
  mkdirSync(WORK, { recursive: true });
  writeFileSync(LOCK, String(process.pid));
  let stack: { stop: () => Promise<void> } | null = null;
  let browser: Browser | null = null;
  try {
    let recorder: ((clip: ClipId, locale: Locale, theme: Theme) => (dir: string) => Promise<EventsFile>) | null = null;
    if (!flags.skipRecord) {
      // The e2e helpers and the stack read .env.test and FLOWLINE_TEST_*: point them at the demo stack (never :3100).
      const { DEMO_STACK, startStack } = await import("./stack");
      process.loadEnvFile(join(ROOT, ".env.test"));
      Object.assign(process.env, { FLOWLINE_TEST_PORT: String(DEMO_STACK.port), FLOWLINE_TEST_FAKE_PORT: String(DEMO_STACK.fakePort), FLOWLINE_TEST_AI_PORT: String(DEMO_STACK.aiPort), FLOWLINE_TEST_DB: DEMO_STACK.db });
      const s = await startStack({ rebuild: flags.rebuild, log });
      stack = s;
      const { chromium } = await import("@playwright/test");
      browser = await chromium.launch({ headless: true, args: [`--force-device-scale-factor=${VIEWPORT.dsf}`, `--window-size=${VIEWPORT.w},${VIEWPORT.h}`] });
      const all = await scenarios();
      const b = browser;
      recorder = (clip, locale, theme) => (dir) => record(b, s.url, all[clip], locale, theme, dir);
    }
    const tooling = { playwright: toolVersion("@playwright/test", ROOT), remotion: toolVersion("remotion", TOOL) };
    const uiCommit = gitHead();
    for (const clip of flags.only)
      for (const locale of flags.locales)
        for (const theme of flags.themes) {
          const r = await buildOne(clip, locale, theme, flags, recorder ? recorder(clip, locale, theme) : null);
          // The manifest is merged after every clip, so a later failure keeps the clips already built.
          let old: Manifest | null = null;
          if (existsSync(join(OUT, "manifest.json"))) old = await readManifest(OUT);
          const m = mergeManifest(old, { clips: { [clip]: r.entry }, files: r.files as ManifestFile[], replace: [r.slice], uiCommit, generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"), tooling });
          await writeManifest(OUT, m);
          for (const f of await staleFiles(OUT, m)) unlinkSync(join(OUT, f));
        }
    log(`built ${flags.only.join(", ")} × ${flags.locales.join(", ")} × ${flags.themes.join(", ")}; run \`pnpm demo:verify\` next`);
  } finally {
    await browser?.close();
    await stack?.stop();
    rmSync(join(TOOL, "public"), { recursive: true, force: true });
    rmSync(LOCK, { force: true });
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const main = cmd === "doctor" ? () => doctor() : cmd === "build" ? () => build(rest) : cmd === "verify" ? () => verify(rest) : null;
if (!main) {
  console.error("usage: tsx scripts/demo/cli.ts doctor | build [--only hero,run] [--locale ar|en|all] [--theme light|dark|all] [--skip-record] [--skip-render] [--concurrency 2] [--rebuild] | verify");
  process.exit(2);
}
main().then(
  (code) => process.exit(typeof code === "number" ? code : 0),
  (e: Error) => {
    console.error(`[demo] ${e.message}`);
    process.exit(1);
  },
);
