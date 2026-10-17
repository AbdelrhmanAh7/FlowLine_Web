// Paths of the demo pipeline, the build lock and the theme tokens (shared by build, doctor and verify).
import { closeSync, existsSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Theme, ThemeTokens } from "../../tools/demo-video/src/props";

export const ROOT = resolve(import.meta.dirname, "../..");
export const TOOL = join(ROOT, "tools/demo-video");
export const WORK = join(TOOL, ".work");
export const OUT = join(ROOT, "public/media/demo");
export const LOCK = join(WORK, "build.lock");

/** Sentinel for a lock file that exists but whose pid has not been written yet (see lockHeld). */
export const LOCK_STARTING = -1;
/** How long an unparsable lock still counts as held, covering the window between `openSync("wx")` and the pid write. */
export const LOCK_GRACE_MS = 5000;

/**
 * A live pid, `LOCK_STARTING` while a just-created lock's pid is still being written, or null when the lock is absent
 * or stale. A lock file is created exclusively (`openSync("wx")`) before its owner writes the pid, so for a few
 * milliseconds it is empty: treating that as free would let a second build remove a live lock. An empty or corrupt
 * file therefore counts as held until it is older than `graceMs`; a real pid is alive unless `kill` says ESRCH (EPERM
 * means another user owns it, so it is alive).
 */
export function lockHeld(file = LOCK, graceMs = LOCK_GRACE_MS): number | null {
  if (!existsSync(file)) return null;
  const content = readFileSync(file, "utf8");
  const pid = Number(content);
  if (!Number.isInteger(pid) || pid <= 0) {
    return Date.now() - statSync(file).mtimeMs < graceMs ? LOCK_STARTING : null;
  }
  try {
    process.kill(pid, 0);
    return pid;
  } catch (e) {
    // Only "no such process" frees the lock; EPERM means the pid is alive under another user.
    return (e as NodeJS.ErrnoException).code === "ESRCH" ? null : pid;
  }
}

/**
 * Takes the build lock exclusively: O_CREAT|O_EXCL means two builds can never both proceed even when they race the
 * existence check. Fails closed — a stale lock (its pid is gone) is never taken over; the build stops and says how
 * to remove the file, so a recording can never mix with a leftover lock from a killed build.
 */
export function acquireLock(file = LOCK): void {
  let fd: number;
  try {
    fd = openSync(file, "wx");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const held = lockHeld(file);
    if (held === LOCK_STARTING) throw new Error(`another demo build is starting; wait for it (lock ${file} was just created)`);
    if (held !== null) throw new Error(`another demo build is running (pid ${held}); wait for it (lock ${file})`);
    throw new Error(`stale demo build lock ${file} (its pid is gone): the build that wrote it died without releasing it; remove the file and re-run`);
  }
  writeSync(fd, String(process.pid));
  closeSync(fd);
}

export function releaseLock(file = LOCK): void {
  rmSync(file, { force: true });
}

/** semantic.<theme>.* and the brand/sky/neutral scales from src/design/tokens.json, references resolved. */
export function themeTokens(theme: Theme): ThemeTokens {
  const json = JSON.parse(readFileSync(join(ROOT, "src/design/tokens.json"), "utf8"));
  const val = (path: string): string => {
    const node = path.split(".").reduce((o, k) => o?.[k], json);
    const v = node?.$value as string | undefined;
    if (typeof v !== "string") throw new Error(`token ${path} missing`);
    const ref = v.match(/^\{(.+)\}$/);
    return ref ? val(ref[1]!) : v;
  };
  const scale = (name: string) => Object.fromEntries(Object.keys(json.color[name]).map((k) => [k, val(`color.${name}.${k}`)]));
  const s = `semantic.${theme}`;
  return { bg: val(`${s}.bg`), accent: val(`${s}.accent`), textHi: val(`${s}.text-hi`), surface: val(`${s}.surface`), brand: scale("brand"), sky: scale("sky"), neutral: scale("neutral") };
}

