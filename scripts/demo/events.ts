// events.json (recorder → compositor): schema and helpers. The type is `EventsFile` in tools/demo-video/src/props.ts;
// the zod schema below must stay exactly in step with it (the type-level check at the bottom enforces that).
import { z } from "zod";
import type { EventsFile } from "../../tools/demo-video/src/props";

const num = z.number().finite();
const pt = z.tuple([num, num]);
const box = z.object({ x: num, y: num, w: num, h: num }).strict();
const t = num.nonnegative();

const move = z.object({ t, type: z.literal("move"), from: pt, to: pt, dur: num.nonnegative() }).strict();
const click = z.object({ t, type: z.literal("click"), x: num, y: num, box, label: z.string().optional() }).strict();
const focus = z.object({ t, type: z.literal("focus"), box, label: z.string().optional() }).strict();
const type = z.object({ t, type: z.literal("type"), box, t1: t, label: z.string().optional() }).strict();
const drag = z.object({ t, type: z.literal("drag"), from: pt, to: pt, dur: num.nonnegative(), box: box.optional(), label: z.string().optional() }).strict();
const beat = z.object({ t, type: z.literal("beat"), id: z.string().min(1) }).strict();

export const EventsSchema = z
  .object({
    schema: z.literal(1),
    viewport: z.object({ w: num.positive(), h: num.positive(), dsf: num.positive() }).strict(),
    duration: num.positive(),
    locale: z.enum(["ar", "en"]),
    theme: z.enum(["light", "dark"]),
    events: z.array(z.discriminatedUnion("type", [move, click, focus, type, drag, beat])),
  })
  .strict();

// Compile-time guarantee that the schema output is the EventsFile type (both directions).
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const _eventsTypeCheck: Same<z.infer<typeof EventsSchema>, EventsFile> = true;

export function parseEvents(json: string | unknown): EventsFile {
  let raw: unknown = json;
  if (typeof json === "string") {
    try {
      raw = JSON.parse(json);
    } catch (e) {
      throw new Error(`events.json is not valid JSON: ${(e as Error).message}`);
    }
  }
  const r = EventsSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`events.json is invalid: ${issues}`);
  }
  return r.data;
}

export function beatIds(events: EventsFile): string[] {
  return events.events.flatMap((e) => (e.type === "beat" ? [e.id] : []));
}

/** Recorded time (seconds) of the first beat with this id. */
export function beatTime(events: EventsFile, id: string): number {
  for (const e of events.events) if (e.type === "beat" && e.id === id) return e.t;
  throw new Error(`beat "${id}" was not recorded (have: ${beatIds(events).join(", ") || "none"})`);
}
