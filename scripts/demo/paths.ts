// Paths of the demo pipeline, the build lock and the theme tokens (shared by build, doctor and verify).
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Theme, ThemeTokens } from "../../tools/demo-video/src/props";

export const ROOT = resolve(import.meta.dirname, "../..");
export const TOOL = join(ROOT, "tools/demo-video");
export const WORK = join(TOOL, ".work");
export const OUT = join(ROOT, "public/media/demo");
export const LOCK = join(WORK, "build.lock");

/** The pid in `file`, when it names an integer process that is alive (EPERM counts as alive; a dead or corrupt lock frees it). */
export function lockHeld(file = LOCK): number | null {
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, "utf8"));
  if (!Number.isInteger(pid)) return null;
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
    if (held) throw new Error(`another demo build is running (pid ${held}); wait for it (lock ${file})`);
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

