// WebVTT writer and the caption rules every caption must pass (issue #96 section 7).
export type Cue = { t0: number; t1: number; text: string };

const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Seconds → `HH:MM:SS.mmm`. */
export function formatVttTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) throw new Error(`formatVttTime: invalid time ${s}`);
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3_600_000), 2)}:${pad(Math.floor(ms / 60_000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)}.${pad(ms % 1000, 3)}`;
}

export function writeVtt(cues: Cue[], lang: "ar" | "en"): string {
  const sorted = [...cues].sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
  const out = ["WEBVTT", ""];
  sorted.forEach((c, k) => {
    if (!(c.t1 > c.t0)) throw new Error(`vtt(${lang}): cue ${k + 1} ends (${c.t1}s) before it starts (${c.t0}s)`);
    if (c.text.includes("-->")) throw new Error(`vtt(${lang}): cue ${k + 1} text contains "-->"`);
    if (c.text.trim() === "") throw new Error(`vtt(${lang}): cue ${k + 1} is empty`);
    const prev = sorted[k - 1];
    if (prev && c.t0 < prev.t1) throw new Error(`vtt(${lang}): cue ${k + 1} (${formatVttTime(c.t0)}) overlaps cue ${k} (ends ${formatVttTime(prev.t1)})`);
    out.push(String(k + 1), `${formatVttTime(c.t0)} --> ${formatVttTime(c.t1)}`);
    for (const line of c.text.split("\n")) out.push(line.replace(/\s+$/, ""));
    out.push("");
  });
  return out.join("\n");
}

export const CAPTION_RULES = {
  en: { maxLine: 42, maxCps: 17 },
  ar: { maxLine: 34, maxCps: 12 },
  maxLines: 2,
  minDurS: 1.2,
} as const;

/** Greedy word wrap at `max` characters per line (a single longer word gets its own line). */
export function wrapGreedy(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (cur === "") cur = word;
    else if ([...cur].length + 1 + [...word].length <= max) cur += " " + word;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

/** Problems of one caption shown for `durS` seconds (empty list = ok). */
export function checkCaption(text: string, locale: "ar" | "en", durS: number): string[] {
  const rule = CAPTION_RULES[locale];
  const problems: string[] = [];
  const flat = text.replace(/\s+/g, " ").trim();
  const lines = wrapGreedy(flat, rule.maxLine);
  if (lines.length > CAPTION_RULES.maxLines) problems.push(`${lines.length} lines at ${rule.maxLine} chars/line (max ${CAPTION_RULES.maxLines})`);
  if (durS < CAPTION_RULES.minDurS) problems.push(`on screen ${durS.toFixed(2)} s (min ${CAPTION_RULES.minDurS} s)`);
  const cps = [...flat].length / durS;
  if (durS > 0 && cps > rule.maxCps) problems.push(`reading speed ${cps.toFixed(1)} chars/s (max ${rule.maxCps})`);
  return problems.map((p) => `"${flat}": ${p}`);
}
