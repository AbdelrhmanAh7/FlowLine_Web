// Storyboards: scripts/demo/storyboard/<clip>.json. Every on-screen text is anchored to a recorded BEAT (never to
// absolute seconds), so a slower recording moves the captions with it. `resolveStoryboard` turns a storyboard plus the
// recorded events.json into the timed props the compositor and the VTT writer consume.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { EventsFile, Locale, TimedText } from "../../tools/demo-video/src/props";
import { beatIds } from "./events";

const bilingual = { ar: z.string().min(1), en: z.string().min(1) };
const beat = z.string().min(1);

export const StoryboardSchema = z
  .object({
    clip: z.string().min(1),
    beats: z.array(beat).min(1),
    captions: z.array(z.object({ beat, at: z.number().default(0), dur: z.number().positive(), ...bilingual }).strict()).optional(),
    chips: z.object({ in: beat, out: beat, items: z.array(z.object({ beat, ...bilingual }).strict()).min(1) }).strict().optional(),
    chapters: z.array(z.object({ id: z.string().min(1), beat, dur: z.number().positive(), ...bilingual }).strict()).optional(),
    endCard: z.object({ beat }).strict().optional(),
    poster: z.object({ beat, at: z.number().default(0) }).strict(),
  })
  .strict();

export type Storyboard = z.infer<typeof StoryboardSchema>;

export function parseStoryboard(json: unknown, where = "storyboard"): Storyboard {
  const r = StoryboardSchema.safeParse(json);
  if (!r.success) throw new Error(`${where} is invalid: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  const sb = r.data;
  const declared = new Set(sb.beats);
  const used = [
    ...(sb.captions ?? []).map((c) => c.beat),
    ...(sb.chips ? [sb.chips.in, sb.chips.out, ...sb.chips.items.map((i) => i.beat)] : []),
    ...(sb.chapters ?? []).map((c) => c.beat),
    ...(sb.endCard ? [sb.endCard.beat] : []),
    sb.poster.beat,
  ];
  const unknown = [...new Set(used.filter((b) => !declared.has(b)))];
  if (unknown.length) throw new Error(`${where}: beat(s) ${unknown.join(", ")} not declared in "beats"`);
  return sb;
}

export async function loadStoryboard(clip: string): Promise<Storyboard> {
  const file = fileURLToPath(new URL(`./storyboard/${clip}.json`, import.meta.url));
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new Error(`no storyboard for clip "${clip}" (${file})`);
  }
  const sb = parseStoryboard(JSON.parse(raw), `storyboard ${clip}`);
  if (sb.clip !== clip) throw new Error(`storyboard ${clip}: "clip" says "${sb.clip}"`);
  return sb;
}

/** Declared beats the recording did not produce. */
export function missingBeats(sb: Storyboard, events: EventsFile): string[] {
  const have = new Set(beatIds(events));
  return sb.beats.filter((b) => !have.has(b));
}

export type ResolveOpts = { formatNumber: (n: number) => string; badge: string };

export type ResolvedStoryboard = {
  captions: TimedText[];
  chips?: { tIn: number; tOut: number; items: { t0: number; text: string }[] };
  chapters: (TimedText & { index: number })[];
  endCard?: { t0: number; wordmark: string; badge: string };
  posterT: number;
  chapterMarks: { id: string; t: number }[];
};

export function resolveStoryboard(sb: Storyboard, events: EventsFile, locale: Locale, opts: ResolveOpts): ResolvedStoryboard {
  const missing = missingBeats(sb, events);
  if (missing.length) throw new Error(`storyboard ${sb.clip}: beat(s) not recorded: ${missing.join(", ")}`);
  const at = (id: string) => events.events.find((e) => e.type === "beat" && e.id === id)!.t;
  const end = events.duration;

  const captions: TimedText[] = [];
  for (const c of sb.captions ?? []) {
    const t0 = at(c.beat) + c.at;
    if (t0 >= end) continue;
    captions.push({ t0, t1: Math.min(t0 + c.dur, end), text: c[locale] });
  }

  const chips = sb.chips && {
    tIn: at(sb.chips.in),
    tOut: at(sb.chips.out),
    items: sb.chips.items.map((c, i) => ({ t0: at(c.beat), text: `${opts.formatNumber(i + 1)} ${c[locale]}` })),
  };

  const chapterDefs = sb.chapters ?? [];
  const chapters = chapterDefs.map((c, i) => {
    const t0 = at(c.beat);
    return { t0, t1: Math.min(t0 + c.dur, end), text: `${opts.formatNumber(i + 1)} · ${c[locale]}`, index: i + 1 };
  });

  return {
    captions,
    ...(chips ? { chips } : {}),
    chapters,
    ...(sb.endCard ? { endCard: { t0: at(sb.endCard.beat), wordmark: "FlowLine", badge: opts.badge } } : {}),
    posterT: at(sb.poster.beat) + sb.poster.at,
    chapterMarks: chapterDefs.map((c, i) => ({ id: c.id, t: chapters[i]!.t0 })),
  };
}
