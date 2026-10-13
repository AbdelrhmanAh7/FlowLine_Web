import { describe, expect, it } from "vitest";
import { duration, initials, percent, pretty, timeAgo, toDecimalString } from "@/lib/format";
import { CATALOGUES } from "@/i18n/translate";

describe("lib/format helpers", () => {
  describe("percent", () => {
    it("renders nullish as an em dash", () => {
      expect(percent(null)).toBe("—");
      expect(percent(undefined)).toBe("—");
    });
    it("formats the ratio with one decimal", () => {
      expect(percent(0.1234)).toBe("12.3%");
      expect(percent(0)).toBe("0.0%");
      expect(percent(1)).toBe("100.0%");
    });
  });

  describe("pretty", () => {
    it("renders undefined as an em dash", () => {
      expect(pretty(undefined)).toBe("—");
    });
    it("stringifies objects with a two-space indent", () => {
      const value = { flow: "greet", steps: 2 };
      expect(pretty(value)).toBe(JSON.stringify(value, null, 2));
    });
    it("stringifies null as \"null\"", () => {
      expect(pretty(null)).toBe("null");
    });
  });

  describe("initials", () => {
    it("takes up to two letters, ignoring blank runs", () => {
      expect(initials("ada")).toBe("A");
      expect(initials("ada lovelace")).toBe("AL");
      expect(initials("ada king lovelace")).toBe("AK");
      expect(initials("  ada   lovelace  ")).toBe("AL");
      expect(initials("")).toBe("");
    });
  });

  describe("duration", () => {
    it("formats milliseconds, seconds and minutes (en)", () => {
      expect(duration(850)).toBe("850ms");
      expect(duration(12300)).toBe("12.3s");
      expect(duration(125000)).toBe("2m 5s");
    });
    it("renders nullish as an em dash", () => {
      expect(duration(null)).toBe("—");
      expect(duration(undefined)).toBe("—");
    });
    it("Arabic keeps Western digits (ar-EG-u-nu-latn)", () => {
      const arMs = duration(850, "ar");
      expect(arMs).not.toMatch(/[٠-٩]/);
      expect(arMs).toContain("850");
      expect(arMs).toContain("ملي");

      const arSeconds = duration(12300, "ar");
      expect(arSeconds).not.toMatch(/[٠-٩]/);
      expect(arSeconds).toContain("12.3");
      expect(arSeconds).toContain("ث");

      const arMinutes = duration(125000, "ar");
      expect(arMinutes).not.toMatch(/[٠-٩]/);
      expect(arMinutes).toContain("د");
      expect(arMinutes).toContain("2");
      expect(arMinutes).toContain("5");
    });
    it("Arabic also renders nullish as an em dash", () => {
      expect(duration(null, "ar")).toBe("—");
      expect(duration(undefined, "ar")).toBe("—");
    });
  });

  describe("timeAgo", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");

    it("under 10 s reads as the now form", () => {
      expect(timeAgo(new Date(now - 3000), now)).toBe(timeAgo(new Date(now), now));
      expect(timeAgo(new Date(now - 3000), now)).toBe("now");
    });

    it("five minutes earlier reads as minutes (en)", () => {
      const ago = timeAgo(new Date(now - 5 * 60_000), now);
      expect(ago).toMatch(/5/);
      expect(ago).toMatch(/m/);
    });

    it("nullish reads the catalogue's never word", () => {
      expect(timeAgo(null, now)).toBe(CATALOGUES.en.common.never);
      expect(timeAgo(undefined, now)).toBe(CATALOGUES.en.common.never);
      expect(timeAgo(null, now, "ar")).toBe(CATALOGUES.ar.common.never);
      expect(timeAgo(undefined, now, "ar")).toBe(CATALOGUES.ar.common.never);
    });
  });

  describe("toDecimalString", () => {
    it("rounds to two decimal places", () => {
      expect(toDecimalString("12.5")).toBe("12.50");
      expect(toDecimalString(12.5)).toBe("12.50");
      expect(toDecimalString("12.50")).toBe("12.50");
      expect(toDecimalString(0)).toBe("0.00");
      expect(toDecimalString("0")).toBe("0.00");
    });

    it("handles large exponents", () => {
      expect(toDecimalString(1e21)).toBe("1000000000000000000000.00");
      expect(toDecimalString("1e21")).toBe("1000000000000000000000.00");
    });

    it("handles negative numbers", () => {
      expect(toDecimalString(-3.1)).toBe("-3.10");
      expect(toDecimalString("-0")).toBe("0.00");
      expect(toDecimalString("-12.5")).toBe("-12.50");
    });

    it("handles different scales", () => {
      expect(toDecimalString("12.5", 0)).toBe("13");
      expect(toDecimalString("12.5", 4)).toBe("12.5000");
      expect(toDecimalString("12.5", 1)).toBe("12.5");
    });

    it("handles Arabic-Indic digits", () => {
      expect(toDecimalString("١٢٫٥٠")).toBe("12.50");
      expect(toDecimalString("١٢.٥")).toBe("12.50");
    });

    it("rejects NaN", () => {
      expect(() => toDecimalString(NaN)).toThrow(RangeError);
    });

    it("rejects Infinity", () => {
      expect(() => toDecimalString(Infinity)).toThrow(RangeError);
      expect(() => toDecimalString(-Infinity)).toThrow(RangeError);
    });

    it("rejects strings with more decimals than scale", () => {
      expect(() => toDecimalString("1.234", 2)).toThrow(RangeError);
      expect(() => toDecimalString("1.2345", 2)).toThrow(RangeError);
      expect(() => toDecimalString(0.1 + 0.2, 2)).toThrow(RangeError);
    });

    it("rejects empty strings", () => {
      expect(() => toDecimalString("")).toThrow(RangeError);
    });

    it("rejects invalid strings", () => {
      expect(() => toDecimalString("abc")).toThrow(RangeError);
      expect(() => toDecimalString("1e")).toThrow(RangeError);
      expect(() => toDecimalString("1.2.3")).toThrow(RangeError);
    });
  });
});
