import { describe, expect, it } from "vitest";
import { percent, pretty, initials, duration, timeAgo } from "@/lib/format";
import { CATALOGUES } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

describe("lib/format", () => {
  describe("percent", () => {
    it("returns — for null and undefined", () => {
      expect(percent(null)).toBe("—");
      expect(percent(undefined)).toBe("—");
    });

    it("converts a number to a percentage with one decimal", () => {
      expect(percent(0.1234)).toBe("12.3%");
      expect(percent(0.95)).toBe("95.0%");
      expect(percent(1)).toBe("100.0%");
      expect(percent(0)).toBe("0.0%");
    });
  });

  describe("pretty", () => {
    it("returns — for undefined", () => {
      expect(pretty(undefined)).toBe("—");
    });

    it("indents objects and other values", () => {
      expect(pretty({ a: 1, b: 2 })).toMatch(/^\{\s+"a": 1,\s+"b": 2\s+\}$/);
      expect(pretty(["x", "y"])).toMatch(/^\[\s+"x",\s+"y"\s+\]$/);
      expect(pretty("hello")).toBe('"hello"');
      expect(pretty(42)).toBe("42");
    });
  });

  describe("initials", () => {
    it("returns the first two letters of up to two words", () => {
      expect(initials("John")).toBe("J");
      expect(initials("John Doe")).toBe("JD");
      expect(initials("John Robert Doe")).toBe("JR");
    });

    it("handles extra spaces", () => {
      expect(initials("John  Doe")).toBe("JD");
      expect(initials("  John  Doe  ")).toBe("JD");
      expect(initials("   ")).toBe("");
    });

    it("returns an empty string for an empty input", () => {
      expect(initials("")).toBe("");
    });
  });

  describe("duration", () => {
    it("formats durations in en", () => {
      expect(duration(null, "en")).toBe("—");
      expect(duration(undefined, "en")).toBe("—");
      expect(duration(850, "en")).toBe("850ms");
      expect(duration(12300, "en")).toBe("12.3s");
      expect(duration(125000, "en")).toBe("2m 5s");
    });

    it("formats durations in ar", () => {
      expect(duration(null, "ar")).toBe("—");
      expect(duration(850, "ar")).toBe("850 ملي ث");
    });
  });

  describe("timeAgo", () => {
    const locales: Locale[] = ["en", "ar"];
    const now = 1234567890000;

    locales.forEach((locale) => {
      it(`formats relative times correctly in ${locale}`, () => {
        expect(timeAgo(null, now, locale)).toBe(CATALOGUES[locale].common.never);
        expect(timeAgo(undefined, now, locale)).toBe(CATALOGUES[locale].common.never);
      });
    });
  });
});
