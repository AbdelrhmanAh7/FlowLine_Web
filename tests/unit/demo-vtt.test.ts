import { describe, expect, it } from "vitest";
import { checkCaption, formatVttTime, writeVtt } from "../../scripts/demo/vtt";

describe("formatVttTime", () => {
  it("formats HH:MM:SS.mmm including hours", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
    expect(formatVttTime(12.3456)).toBe("00:00:12.346");
    expect(formatVttTime(61.5)).toBe("00:01:01.500");
    expect(formatVttTime(3725.04)).toBe("01:02:05.040");
  });
  it("rejects negative and non-finite times", () => {
    expect(() => formatVttTime(-1)).toThrow();
    expect(() => formatVttTime(Number.NaN)).toThrow();
  });
});

describe("writeVtt", () => {
  it("writes a header, numbered and sorted cues, no trailing spaces", () => {
    const vtt = writeVtt([{ t0: 5, t1: 8, text: "second  " }, { t0: 1, t1: 4.5, text: "first" }], "en");
    expect(vtt).toBe("WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.500\nfirst\n\n2\n00:00:05.000 --> 00:00:08.000\nsecond\n");
    expect(vtt.split("\n").every((l) => l === l.trimEnd())).toBe(true);
  });
  it("rejects overlapping cues, arrows in text, empty or inverted cues", () => {
    expect(() => writeVtt([{ t0: 0, t1: 3, text: "a" }, { t0: 2, t1: 4, text: "b" }], "en")).toThrow(/overlaps/);
    expect(() => writeVtt([{ t0: 0, t1: 3, text: "a --> b" }], "en")).toThrow(/-->/);
    expect(() => writeVtt([{ t0: 3, t1: 3, text: "a" }], "en")).toThrow(/before it starts/);
    expect(() => writeVtt([{ t0: 0, t1: 3, text: "  " }], "ar")).toThrow(/empty/);
  });
  it("allows back-to-back cues", () => {
    expect(() => writeVtt([{ t0: 0, t1: 2, text: "a" }, { t0: 2, t1: 4, text: "b" }], "en")).not.toThrow();
  });
});

describe("checkCaption", () => {
  it("accepts a normal English caption", () => {
    expect(checkCaption("Start from a ready-made template that runs on sample data.", "en", 3.8)).toEqual([]);
  });
  it("accepts a normal Arabic caption", () => {
    expect(checkCaption("ابدأ من قالب جاهز يعمل على بيانات تجريبية.", "ar", 4)).toEqual([]);
  });
  it("flags more than two lines", () => {
    const p = checkCaption("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen", "en", 20);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/3 lines/);
  });
  it("flags a too-fast Arabic caption", () => {
    const p = checkCaption("ابدأ من قالب جاهز يعمل على بيانات تجريبية.", "ar", 2);
    expect(p.some((x) => /reading speed/.test(x))).toBe(true);
  });
  it("flags short on-screen time", () => {
    expect(checkCaption("Run it", "en", 1)[0]).toMatch(/min 1.2 s/);
  });
  it("uses the narrower Arabic line width", () => {
    const text = "كلمة ".repeat(16).trim(); // 16 words: 3 lines at 34 chars, 2 lines at 42
    expect(checkCaption(text, "ar", 30).some((x) => /lines/.test(x))).toBe(true);
    expect(checkCaption("word ".repeat(16).trim(), "en", 30).some((x) => /lines/.test(x))).toBe(false);
  });
});
