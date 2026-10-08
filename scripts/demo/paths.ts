// Paths of the demo pipeline, the build lock and the theme tokens (shared by build, doctor and verify).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Theme, ThemeTokens } from "../../tools/demo-video/src/props";

export const ROOT = resolve(import.meta.dirname, "../..");
export const TOOL = join(ROOT, "tools/demo-video");
export const WORK = join(TOOL, ".work");
export const OUT = join(ROOT, "public/media/demo");
export const LOCK = join(WORK, "build.lock");

/** One demo build at a time on this machine (and never two Remotion renders fighting for RAM). */
export function lockHeld(): number | null {
  if (!existsSync(LOCK)) return null;
  const pid = Number(readFileSync(LOCK, "utf8"));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
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

