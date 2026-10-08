// `pnpm demo:verify`: checks the committed public/media/demo/ against the manifest contract and the budgets, probes
// every video (canvas, fps, BT.709, no audio, codec string), checks the loop seams, the hero's accent colour and
// (when the work dir is still there) the delivered PSNR, flags stale media, and writes a 6-still contact sheet per clip
// to artifacts/demo-media/ for review before committing.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { DemoProps, EventsFile } from "../../tools/demo-video/src/props";
import { BUDGET, CLIPS, VIEWPORT, workKey, type ClipId } from "./clips";
import { sampleTimes } from "./deliver";
import { codecString, extractFrame, probe, psnrAt, psnrRgb } from "./ffmpeg";
import { budgetReport, readManifest, staleFiles, type ManifestFile } from "./manifest";
import { OUT, ROOT, WORK, themeTokens } from "./paths";

const SHEETS = join(ROOT, "artifacts/demo-media");
const TMP = join(WORK, "verify");

async function rawRgb(png: string) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** The dominant colour inside a pixel box (quantized histogram; the button fill, not its label). */
export function dominantColour(img: { data: Uint8Array; w: number }, box: { x: number; y: number; w: number; h: number }): [number, number, number] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = Math.round(box.y); y < Math.round(box.y + box.h); y++)
    for (let x = Math.round(box.x); x < Math.round(box.x + box.w); x++) {
      const i = (y * img.w + x) * 3;
      const [r, g, b] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bin = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bins.set(k, bin);
    }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0]!;
  return [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)];
}

/**
 * Decoded colour of the Run button at frame 0 of a window-framed video (wide shot: the app shown at 13/15 of the
 * canvas, centred) vs semantic.<theme>.accent; throws when any channel is off by more than 6.
 */
export async function checkAccent(video: string, ev: EventsFile, props: Pick<DemoProps, "canvas" | "theme">) {
  const run = ev.events.find((e) => e.type === "click" && e.label === "run");
  if (!run || run.type !== "click") throw new Error("accent check: no `run` click in events.json");
  const { w: W, h: H } = props.canvas;
  const winW = Math.min((W * 13) / 15, ((H * 13) / 15) * (VIEWPORT.w / VIEWPORT.h));
  const k = winW / VIEWPORT.w;
  const x0 = (W - winW) / 2;
  const y0 = (H - (winW * VIEWPORT.h) / VIEWPORT.w) / 2;
  const b = run.box;
  const inner = { x: x0 + (b.x + b.w * 0.15) * k, y: y0 + (b.y + b.h * 0.2) * k, w: b.w * 0.7 * k, h: b.h * 0.6 * k };
  mkdirSync(TMP, { recursive: true });
  const png = join(TMP, "accent.png");
  await extractFrame(video, 0, png);
  const got = dominantColour(await rawRgb(png), inner);
  const want = hexRgb(themeTokens(props.theme).accent);
  const off = Math.max(...got.map((v, i) => Math.abs(v - want[i]!)));
  if (off > BUDGET.accentTolerance) throw new Error(`accent check: Run button decodes as rgb(${got.join(",")}), accent is rgb(${want.join(",")}) (off by ${off} > ${BUDGET.accentTolerance})`);
  return { got, want, off };
}

/** Last frame vs first frame of a loop. */
async function seamPsnr(video: string, durationS: number, fps: number) {
  mkdirSync(TMP, { recursive: true });
  const a = join(TMP, "first.png");
  const b = join(TMP, "last.png");
  await extractFrame(video, 0, a);
  await extractFrame(video, Math.max(0, durationS - 1.5 / fps), b);
  return psnrRgb((await rawRgb(a)).data, (await rawRgb(b)).data);
}

async function contactSheet(video: string, durationS: number, out: string) {
  const tiles: Buffer[] = [];
  for (const [i, t] of sampleTimes(durationS).entries()) {
    const png = join(TMP, `sheet-${i}.png`);
    await extractFrame(video, t, png);
    tiles.push(await sharp(png).resize({ width: 640, height: 360, fit: "contain", background: "#ffffff" }).toBuffer());
  }
  await sharp({ create: { width: 1920, height: 720, channels: 3, background: "#ffffff" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 3) * 640, top: Math.floor(i / 3) * 360 })))
    .jpeg({ quality: 80 })
    .toFile(out);
}

export async function verify(_argv: string[] = []): Promise<number> {
  const problems: string[] = [];
  const notes: string[] = [];
  if (!existsSync(join(OUT, "manifest.json"))) {
    console.error("no public/media/demo/manifest.json: run `pnpm demo:build` first");
    return 1;
  }
  const m = await readManifest(OUT); // validates the contract
  problems.push(...budgetReport(m.files, OUT));
  for (const f of await staleFiles(OUT, m)) problems.push(`${f}: in public/media/demo/ but not in the manifest`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(SHEETS, { recursive: true });

  const videos = m.files.filter((f): f is Extract<ManifestFile, { kind: "video" }> => f.kind === "video");
  for (const f of videos) {
    const spec = CLIPS[f.clip as ClipId];
    const file = join(OUT, f.path);
    const p = await probe(file);
    const where = f.path;
    if (p.width !== spec.canvas.w || p.height !== spec.canvas.h) problems.push(`${where}: ${p.width}x${p.height}, expected ${spec.canvas.w}x${spec.canvas.h}`);
    if (Math.abs(p.fps - spec.fps) > 0.01) problems.push(`${where}: ${p.fps} fps, expected ${spec.fps}`);
    if (p.hasAudio) problems.push(`${where}: has an audio stream`);
    if (p.colorSpace !== "bt709" || p.colorPrimaries !== "bt709" || p.colorTransfer !== "bt709") problems.push(`${where}: not tagged BT.709 (${p.colorSpace}/${p.colorPrimaries}/${p.colorTransfer})`);
    if (!f.type.includes(codecString(p))) problems.push(`${where}: manifest type ${f.type} but the file is ${codecString(p)}`);
    if (spec.loop) {
      const seam = await seamPsnr(file, p.durationS, p.fps);
      if (seam < BUDGET.minSeamPsnr) problems.push(`${where}: loop seam PSNR ${seam.toFixed(1)} dB < ${BUDGET.minSeamPsnr}`);
      else notes.push(`${where}: loop seam ${seam.toFixed(1)} dB`);
    }
    const dir = join(WORK, workKey(f.clip as ClipId, f.locale, f.theme));
    if (existsSync(join(dir, "composed.mp4"))) {
      const db = await psnrAt(join(dir, "composed.mp4"), file, sampleTimes(p.durationS));
      if (db < BUDGET.minPsnr) problems.push(`${where}: mean PSNR ${db.toFixed(1)} dB vs the composed master < ${BUDGET.minPsnr}`);
      else notes.push(`${where}: PSNR ${db.toFixed(1)} dB vs master`);
      if (f.clip === "hero") {
        const ev = JSON.parse(readFileSync(join(dir, "events.json"), "utf8")) as EventsFile;
        try {
          const a = await checkAccent(file, ev, { canvas: spec.canvas, theme: f.theme });
          notes.push(`${where}: Run button rgb(${a.got.join(",")}) vs accent rgb(${a.want.join(",")})`);
        } catch (e) {
          problems.push(`${where}: ${(e as Error).message}`);
        }
      }
    }
    if (f.codec === "h264") await contactSheet(file, p.durationS, join(SHEETS, `${f.clip}.${f.locale}.${f.theme}.contact.jpg`));
  }

  // Stale media: UI changes since the recorded commit.
  const diff = spawnSync("git", ["diff", "--name-only", `${m.uiCommit}..HEAD`, "--", "src/"], { cwd: ROOT, encoding: "utf8" });
  if (diff.status !== 0) notes.push(`stale check: recorded commit ${m.uiCommit.slice(0, 8)} is not in this checkout's history`);
  else if (diff.stdout.trim()) console.log(`stale: ${diff.stdout.trim().split("\n").length} file(s) under src/ changed since ${m.uiCommit.slice(0, 8)}; re-run \`pnpm demo:build\``);

  const total = m.files.reduce((s, f) => s + f.bytes, 0);
  for (const n of notes) console.log(`ok    ${n}`);
  for (const p of problems) console.log(`FAIL  ${p}`);
  console.log(`\n${m.files.length} files, ${(total / 1e6).toFixed(2)} MB of ${BUDGET.totalCap / 1e6} MB; contact sheets in artifacts/demo-media/`);
  rmSync(TMP, { recursive: true, force: true });
  return problems.length ? 1 : 0;
}
