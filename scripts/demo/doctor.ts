// `pnpm demo:doctor`: checks everything `demo:build` needs and prints the exact fix for each failure.
// It only checks that .env.test exists (its values are never read or printed).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { LOCK, LOCK_STARTING, ROOT, TOOL, lockHeld } from "./paths";
import { otherBuildRunning } from "./stack";

export type Check = { name: string; ok: boolean; detail: string; fix?: string };

const REMOTION = join(TOOL, "node_modules/.bin/remotion");

/**
 * The Node floor is the root package's `engines` (`24.x`), so 24 and newer pass; only older majors fail. Requires an
 * exact 24 would wrongly reject the owner's newer Node and CI's image, so the check is a floor, not an equality.
 */
export function nodeCheck(version: string): Check {
  const major = Number(version.split(".")[0]);
  const ok = major >= 24;
  return { name: "Node >= 24", ok, detail: `node ${version}`, fix: ok ? undefined : "install Node 24 or newer (the repo's `engines` floor is 24.x: `nvm install 24` or `brew install node@24`)" };
}

export async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, fix?: string) => checks.push({ name, ok, detail, fix: ok ? undefined : fix });

  checks.push(nodeCheck(process.versions.node));

  let chromiumPath = "";
  try {
    const { chromium } = await import("@playwright/test");
    chromiumPath = chromium.executablePath();
  } catch {
    /* reported below */
  }
  add("Playwright Chromium", Boolean(chromiumPath) && existsSync(chromiumPath), chromiumPath || "not found", "pnpm install && pnpm exec playwright install chromium");

  const installed = existsSync(REMOTION);
  add("Remotion package (tools/demo-video)", installed, installed ? "installed" : "tools/demo-video/node_modules missing", "pnpm demo:setup");

  const shellDir = join(TOOL, "node_modules/.remotion/chrome-headless-shell");
  const hasShell = existsSync(shellDir) && readdirSync(shellDir).length > 0;
  add("Remotion browser", hasShell, hasShell ? shellDir.replace(`${ROOT}/`, "") : "chrome-headless-shell not downloaded", "pnpm demo:setup   (runs `remotion browser ensure`)");

  if (installed) {
    const enc = spawnSync(REMOTION, ["ffmpeg", "-hide_banner", "-encoders"], { cwd: TOOL, encoding: "utf8" });
    const out = `${enc.stdout}${enc.stderr}`;
    const missing = ["libx264", "libaom-av1"].filter((e) => !out.includes(e));
    add("remotion ffmpeg encoders (libx264, libaom-av1)", enc.status === 0 && missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "libx264, libaom-av1", "pnpm demo:setup   (reinstall the pinned Remotion 4.0.534; its bundled ffmpeg has both encoders)");
  } else add("remotion ffmpeg encoders (libx264, libaom-av1)", false, "Remotion not installed", "pnpm demo:setup");

  add(".env.test exists", existsSync(join(ROOT, ".env.test")), existsSync(join(ROOT, ".env.test")) ? "present (values not read)" : "missing", "create .env.test from .github/ci/env.test.template (see docs/DEVELOPER_GUIDE.md); never commit it");

  const fs = statfsSync(ROOT);
  const freeGb = (fs.bavail * fs.bsize) / 1e9;
  add("free disk >= 5 GB", freeGb >= 5, `${freeGb.toFixed(1)} GB free`, "free disk space (old tools/demo-video/.work dirs can go: rm -rf tools/demo-video/.work)");

  const held = lockHeld();
  const nextBuild = otherBuildRunning();
  add(
    "no other build running",
    held === null && !nextBuild,
    held === LOCK_STARTING ? `a demo build is starting (${LOCK.replace(`${ROOT}/`, "")} was just created)` : held !== null ? `demo build pid ${held} holds ${LOCK.replace(`${ROOT}/`, "")}` : nextBuild ? "a `next build` (gate or e2e) is running" : "none",
    held === LOCK_STARTING ? "wait a moment for it to finish (a lock file just appeared)" : held !== null ? `wait for pid ${held} to finish (or remove a stale ${LOCK.replace(`${ROOT}/`, "")})` : "wait for the gate/e2e build to finish, then re-run",
  );
  return checks;
}

export async function doctor(): Promise<number> {
  const checks = await runChecks();
  for (const c of checks) {
    console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.name}: ${c.detail}`);
    if (c.fix) console.log(`      fix: ${c.fix}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed: `pnpm demo:build --only hero --locale ar` is ready to run.");
  return failed ? 1 : 0;
}
