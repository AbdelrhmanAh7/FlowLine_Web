/**
 * `pnpm demo:record` — re-record the landing demo (public/media/flowline-demo.*).
 * Needs: a running test/staging app (BASE_URL, default http://localhost:3100) with a seeded DEMO user
 * (DEMO_EMAIL / DEMO_PASSWORD; fake data only, never a real customer) and ffmpeg on PATH.
 * Example: BASE_URL=http://localhost:3100 DEMO_EMAIL=demo@example.test DEMO_PASSWORD=demo-password pnpm demo:record
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT = "public/media";
const MAX_BYTES = 6 * 1024 * 1024;
const SECONDS = 40; // within the 30–60 s window

if (spawnSync("ffmpeg", ["-version"]).error) {
  console.error("ffmpeg is required (brew install ffmpeg / apt install ffmpeg) — it was not found on PATH.");
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.error("Set DEMO_EMAIL and DEMO_PASSWORD to the seeded demo user (see the usage example at the top of this file).");
  process.exit(1);
}

const raw = mkdtempSync(join(tmpdir(), "flowline-demo-"));
try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: raw, size: { width: 1280, height: 720 } }, locale: "en-US" });
  const page = await ctx.newPage();
  const beat = (ms: number) => page.waitForTimeout(ms);

  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app|\/w\//);
  await beat(4000);
  // Key flows on the seeded workspace: open a flow, run it, view results, share/export. Each step is best-effort-visible; failures abort the recording.
  await page.getByRole("link", { name: /flows/i }).first().click();
  await beat(5000);
  await page.getByRole("link").filter({ hasText: /.+/ }).nth(5).click();
  await beat(5000);
  await page.getByRole("button", { name: /^run/i }).first().click();
  await beat(10000);
  await page.getByRole("button", { name: /export|share/i }).first().click();
  await beat(8000);
  await ctx.close();
  await browser.close();

  const webm = readdirSync(raw).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("Playwright produced no recording");
  const src = join(raw, webm);
  mkdirSync(OUT, { recursive: true });
  const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, ...a], { stdio: "inherit" });
  ff("-t", String(SECONDS), "-an", "-c:v", "libx264", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/flowline-demo.mp4`);
  ff("-t", String(SECONDS), "-an", "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", `${OUT}/flowline-demo.webm`);
  ff("-ss", "6", "-frames:v", "1", "-q:v", "4", `${OUT}/flowline-demo.jpg`);

  const cue = (a: number, b: number, text: string) => `${ts(a)} --> ${ts(b)}\n${text}\n`;
  const ts = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`.replace(/^00:/, "");
  const en = ["Sign in to a demo workspace", "Open a flow", "Run it", "Share or export the result"];
  const ar = ["سجّل الدخول إلى مساحة عمل تجريبية", "افتح سير عمل", "شغّله", "شارك النتيجة أو صدّرها"];
  const vtt = (lines: string[]) => "WEBVTT\n\n" + lines.map((l, i) => cue(i * 10, (i + 1) * 10, l)).join("\n");
  writeFileSync(`${OUT}/flowline-demo.en.vtt`, vtt(en));
  writeFileSync(`${OUT}/flowline-demo.ar.vtt`, vtt(ar));

  for (const f of readdirSync(OUT).filter((n) => n.startsWith("flowline-demo."))) {
    const size = statSync(join(OUT, f)).size;
    if (size > MAX_BYTES) throw new Error(`${f} is ${size} bytes, over the 6 MB limit — raise -crf`);
  }
  console.log(`demo → ${OUT}/flowline-demo.{mp4,webm,jpg,en.vtt,ar.vtt}`);
} finally {
  rmSync(raw, { recursive: true, force: true });
}
