/**
 * `pnpm demo:record` re-records the landing demo (public/media/flowline-demo.{mp4,webm,jpg,en.vtt,ar.vtt}) from the real UI.
 * Needs a running TEST stack (`pnpm dev:test`; FLOWLINE_ENV=test for the e-mail outbox) and ffmpeg + ffprobe on PATH.
 * It creates a throwaway fake account (demo-<time>@flowline-demo.test, two workspaces, the lead-qualifier template)
 * through the public API, then records sign in → run the flow → inspect the steps → share a copy at 1280×720.
 * Example: BASE_URL=http://localhost:3100 pnpm demo:record
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type APIRequestContext } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "public/media";
const MAX_BYTES = 6 * 1024 * 1024;
const PASSWORD = "Demo-Passw0rd!";

for (const bin of ["ffmpeg", "ffprobe"]) {
  if (spawnSync(bin, ["-version"]).error) {
    console.error(`${bin} is required (macOS: brew install ffmpeg; Debian/Ubuntu: apt install ffmpeg) and was not found on PATH.`);
    process.exit(1);
  }
}

async function ok(res: Awaited<ReturnType<APIRequestContext["post"]>>, what: string) {
  if (!res.ok()) throw new Error(`${what}: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Fake verified account + workspaces + a template flow, through the API (like e2e/helpers.ts setupUser). */
async function seed(req: APIRequestContext, email: string) {
  await ok(await req.post("/api/auth/sign-up/email", { data: { email, password: PASSWORD, name: "Demo User" } }), "sign-up");
  let link: string | undefined;
  for (let i = 0; i < 40 && !link; i++) {
    const { messages } = await ok(await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`), "outbox (is this a FLOWLINE_ENV=test stack?)");
    link = messages.find((m: { purpose: string | null }) => m.purpose === "verify")?.link;
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  if (!link) throw new Error("no verification e-mail in the test outbox");
  await ok(await req.post("/api/email", { data: { action: "verify", token: new URL(link).searchParams.get("token") } }), "verify");
  await ok(await req.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } }), "sign-in");
  const ws = (await ok(await req.post("/api/workspaces", { data: { name: "Demo Co" } }), "workspace")).workspace;
  await ok(await req.post("/api/workspaces", { data: { name: "Demo Co Ops" } }), "second workspace");
  await ok(await req.post("/api/onboarding", { data: { goal: "sales", skipped: false } }), "onboarding");
  const flow = (await ok(await req.post(`/api/workspaces/${ws.id}/flows`, { data: { templateId: "lead-qualifier" } }), "flow")).flow;
  return { slug: ws.slug as string, flowId: flow.id as string };
}

const raw = mkdtempSync(join(tmpdir(), "flowline-demo-"));
const browser = await chromium.launch();
try {
  const cookies = ["fl_test_beta_mode=open", "fl_locale=en"].map((c) => ({ name: c.split("=")[0], value: c.split("=")[1], url: BASE }));
  const setup = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: new URL(BASE).origin } });
  await setup.addCookies(cookies);
  const email = `demo-${Date.now().toString(36)}@flowline-demo.test`;
  const { slug, flowId } = await seed(setup.request, email);
  await setup.close();

  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 720 }, recordVideo: { dir: raw, size: { width: 1280, height: 720 } } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks: number[] = []; // scene start, seconds into the raw recording
  const scene = () => marks.push((Date.now() - t0) / 1000);
  const beat = (ms: number) => page.waitForTimeout(ms); // pacing for viewers, not synchronisation

  await page.goto("/sign-in");
  await page.getByLabel("Email").waitFor();
  scene();
  await page.getByLabel("Email").pressSequentially(email, { delay: 30 });
  await page.getByLabel("Password").pressSequentially(PASSWORD, { delay: 30 });
  await beat(600);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/w\//);
  await page.goto(`/w/${slug}/flows/${flowId}`);
  await page.locator(".react-flow__node").first().waitFor();
  scene();
  await beat(5000);
  await page.getByRole("button", { name: "▶ Run" }).click();
  const dock = page.getByTestId("run-dock");
  await dock.getByText("SUCCESS").first().waitFor({ timeout: 30_000 });
  scene();
  await beat(6000);
  await dock.getByRole("link", { name: /Open in inspector/ }).click();
  const steps = page.getByTestId("step-panel");
  await steps.waitFor();
  scene();
  await beat(2000);
  await page.getByRole("button", { name: /Normalise lead/ }).first().click();
  await steps.getByRole("tab", { name: "Input" }).click();
  await beat(2500);
  await steps.getByRole("tab", { name: "Output" }).click();
  await beat(5000);
  await page.goto(`/w/${slug}/flows/${flowId}`);
  await page.getByRole("button", { name: "History" }).click();
  const panel = page.getByRole("dialog", { name: "Version history" });
  await panel.locator("#share-target").selectOption({ label: "Demo Co Ops" });
  scene();
  await beat(1500);
  await panel.getByRole("button", { name: "Share copy" }).click();
  await page.getByText(/Copied to the other workspace/).first().waitFor();
  await beat(Math.max(5000, (marks[0] + 35 - (Date.now() - t0) / 1000) * 1000)); // keeps the clip ≥ 35 s
  const end = (Date.now() - t0) / 1000;
  await ctx.close();

  const webm = readdirSync(raw).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("Playwright produced no recording");
  const start = Math.max(0, marks[0] - 0.5);
  const length = Math.min(60, end - start);
  mkdirSync(OUT, { recursive: true });
  const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", start.toFixed(2), "-i", join(raw, webm), ...a], { stdio: "inherit" });
  ff("-t", length.toFixed(2), "-an", "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/flowline-demo.mp4`);
  ff("-t", length.toFixed(2), "-an", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", `${OUT}/flowline-demo.webm`);
  ff("-ss", (marks[1] - start + 2).toFixed(2), "-frames:v", "1", "-q:v", "3", `${OUT}/flowline-demo.jpg`); // poster: the flow on the canvas

  // Captions follow the recorded scene marks, so they stay in sync when the UI gets faster or slower.
  const ts = (s: number) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23); // HH:MM:SS.mmm
  const cues = marks.map((m, i) => [m - start, (marks[i + 1] ?? end) - start]);
  const vtt = (lines: string[]) => "WEBVTT\n\n" + lines.map((l, i) => `${i + 1}\n${ts(cues[i][0])} --> ${ts(Math.min(cues[i][1], length))}\n${l}\n`).join("\n");
  writeFileSync(`${OUT}/flowline-demo.en.vtt`, vtt(["Sign in to your workspace", "Open a flow on the canvas", "Run it: every step succeeds", "Inspect each step's input and output", "Share a copy with another workspace"]));
  writeFileSync(`${OUT}/flowline-demo.ar.vtt`, vtt(["سجّل الدخول إلى مساحة عملك", "افتح سير عمل على اللوحة", "شغّله: تنجح كل خطوة", "افحص مدخلات كل خطوة ومخرجاتها", "شارك نسخة مع مساحة عمل أخرى"]));

  for (const f of ["mp4", "webm", "jpg", "en.vtt", "ar.vtt"].map((e) => `flowline-demo.${e}`)) {
    const size = statSync(join(OUT, f)).size;
    if (size > MAX_BYTES) throw new Error(`${f} is ${size} bytes, over the 6 MB limit: raise -crf`);
  }
  for (const f of ["mp4", "webm"]) {
    const secs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${OUT}/flowline-demo.${f}`]).toString());
    if (!(secs >= 30 && secs <= 60)) throw new Error(`flowline-demo.${f} is ${secs} s, outside 30–60 s`);
  }
  console.log(`demo (${length.toFixed(1)} s) → ${OUT}/flowline-demo.{mp4,webm,jpg,en.vtt,ar.vtt}`);
} finally {
  await browser.close();
  rmSync(raw, { recursive: true, force: true });
}
