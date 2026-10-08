import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvents } from "../../scripts/demo/events";
import { missingBeats, parseStoryboard, resolveStoryboard } from "../../scripts/demo/storyboard";

const sb = parseStoryboard(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/demo/walkthrough.storyboard.json"), "utf8")));
const recorded = (shift = 0, drop: string[] = []) =>
  parseEvents({
    schema: 1,
    viewport: { w: 1280, h: 720, dsf: 1.5 },
    duration: 53,
    locale: "en",
    theme: "light",
    events: [["establish", 0], ["ch1", 1], ["templates", 2], ["ch2", 12], ["shape", 13], ["ch3", 25], ["run", 26 + shift], ["end", 50]]
      .filter(([id]) => !drop.includes(id as string))
      .map(([id, t]) => ({ t, type: "beat", id })),
  });
const opts = { formatNumber: (n: number) => `#${n}`, badge: "Sandbox" };

describe("storyboard", () => {
  it("anchors captions to beats, so shifting a beat shifts its caption", () => {
    const a = resolveStoryboard(sb, recorded(0), "en", opts);
    const b = resolveStoryboard(sb, recorded(3), "en", opts);
    expect(a.captions[0]).toEqual({ t0: 2.4, t1: 5.4, text: "Start from a ready-made template that runs on sample data." });
    expect(a.captions[1]!.t0).toBeCloseTo(26.2);
    expect(b.captions[1]!.t0 - a.captions[1]!.t0).toBeCloseTo(3);
    expect(b.captions[0]).toEqual(a.captions[0]);
  });

  it("numbers chapters and chips through formatNumber and picks the locale", () => {
    const r = resolveStoryboard(sb, recorded(), "ar", opts);
    expect(r.chapters.map((c) => [c.index, c.text, c.t0, c.t1])).toEqual([
      [1, "#1 · ابدأ من قالب", 1, 2.8],
      [2, "#2 · شكّل التدفق", 12, 13.8],
      [3, "#3 · شغّل", 25, 26.8],
    ]);
    expect(r.chips).toEqual({ tIn: 0, tOut: 50, items: [{ t0: 0, text: "#1 ابدأ" }, { t0: 26, text: "#2 شغّل" }] });
    expect(r.chapterMarks).toEqual([{ id: "templates", t: 1 }, { id: "shape", t: 12 }, { id: "run", t: 25 }]);
    expect(r.endCard).toEqual({ t0: 50, wordmark: "FlowLine", badge: "Sandbox" });
    expect(r.posterT).toBeCloseTo(0.6);
  });

  it("clips captions to the clip duration and drops those after it", () => {
    const e = recorded();
    const short = { ...e, duration: 5 };
    const r = resolveStoryboard(sb, short, "en", opts);
    expect(r.captions).toHaveLength(1);
    expect(r.captions[0]!.t1).toBe(5);
  });

  it("throws naming a missing beat", () => {
    const e = recorded(0, ["ch2"]);
    expect(missingBeats(sb, e)).toEqual(["ch2"]);
    expect(() => resolveStoryboard(sb, e, "en", opts)).toThrow(/not recorded: ch2/);
  });

  it("rejects a storyboard that uses an undeclared beat or unknown keys", () => {
    expect(() => parseStoryboard({ ...sb, endCard: { beat: "nowhere" } })).toThrow(/nowhere/);
    expect(() => parseStoryboard({ ...sb, extra: 1 })).toThrow();
  });
});
