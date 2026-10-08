import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIP_IDS } from "../../scripts/demo/clips";
import { guardText } from "../../scripts/demo/kit";
import { loadStoryboard } from "../../scripts/demo/storyboard";
import { checkCaption } from "../../scripts/demo/vtt";

/** The six shipped storyboards (scripts/demo/storyboard/*.json) and the recorder's DOM honesty guard. */
describe("demo storyboards", () => {
  it("there is exactly one storyboard per clip", () => {
    const files = readdirSync("scripts/demo/storyboard").filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(files).toEqual([...CLIP_IDS].sort());
  });

  for (const clip of CLIP_IDS)
    it(`${clip}: parses, and every caption meets the length and reading-speed rules in both languages`, async () => {
      const sb = await loadStoryboard(clip);
      expect(sb.clip).toBe(clip);
      for (const c of sb.captions ?? []) {
        expect(checkCaption(c.en, "en", c.dur), c.en).toEqual([]);
        expect(checkCaption(c.ar, "ar", c.dur), c.ar).toEqual([]);
      }
    });
});

describe("demo honesty guard", () => {
  it("accepts sample data and demo accounts", () => {
    expect(guardText("Ada Lovelace · analytical.io · demo-ar-1a2b3c4d@flowline-demo.test")).toEqual([]);
    expect(guardText("Run #1 succeeded")).toEqual([]);
  });

  it("refuses test doubles, real-looking emails, localhost and API keys", () => {
    expect(guardText("fake-gpt-mini")).toHaveLength(1);
    expect(guardText("ada@analytical.io")).toEqual([expect.stringMatching(/email outside/)]);
    expect(guardText("http://localhost:3190/api/hooks/x")).toEqual([expect.stringMatching(/localhost/)]);
    expect(guardText("key sk-abc123")).toEqual([expect.stringMatching(/sk-/)]);
  });
});
