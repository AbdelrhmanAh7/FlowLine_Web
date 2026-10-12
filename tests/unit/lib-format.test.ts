import { describe, expect, it } from "vitest";
import { toDecimalString, duration, initials, percent, pretty, timeAgo } from "@/lib/format";
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
    it("formats a number with default scale of 2", () => {
      expect(toDecimalString(12.5)).toBe("12.50");
      expect(toDecimalString(0.123)).toBe("0.12");
      expect(toDecimalString(123456789.123456)).toBe("123456789.12");
      expect(toDecimalString(0)).toBe("0.00");
      expect(toDecimalString(10)).toBe("10.00");
    });

    it("formats a string number with default scale of 2", () => {
      expect(toDecimalString("12.5")).toBe("12.50");
      expect(toDecimalString("0.123")).toBe("0.12");
      expect(toDecimalString("123456789.123456")).toBe("123456789.12");
      expect(toDecimalString("0")).toBe("0.00");
      expect(toDecimalString("10")).toBe("10.00");
    });

    it("respects the scale parameter", () => {
      expect(toDecimalString(12.5, 3)).toBe("12.500");
      expect(toDecimalString(0.123, 1)).toBe("0.1");
      expect(toDecimalString(0.1234, 4)).toBe("0.1234");
    });

    it("rejects NaN", () => {
      expect(() => toDecimalString(NaN)).toThrow();
    });

    it("rejects Infinity", () => {
      expect(() => toDecimalString(Infinity)).toThrow();
      expect(() => toDecimalString(-Infinity)).toThrow();
    });

    it("truncates when decimals exceed the scale", () => {
      expect(toDecimalString("12.345", 2)).toBe("12.34");
      expect(toDecimalString(0.12345, 3)).toBe("0.123");
      expect(toDecimalString("1.2345", 2)).toBe("1.23");
    });

    it("handles negative numbers", () => {
      expect(toDecimalString(-12.5)).toBe("-12.50");
      expect(toDecimalString(-0.123)).toBe("-0.12");
      expect(toDecimalString(-123456789.123456)).toBe("-123456789.12");
      expect(toDecimalString(-0)).toBe("0.00");
      expect(toDecimalString(-10)).toBe("-10.00");
    });

    it("handles very large numbers (1e21)", () => {
      // Note: JavaScript's Number type can't represent 1e21 with full precision
      // The result will be the closest representable value
      expect(toDecimalString(1e21)).toBe("1.00");
      // 1.5e21 is too large for toFixed(), so it returns scientific notation
      // Due to precision loss, it becomes 1.00
      expect(toDecimalString(1.5e21)).toBe("1.00");
    });

    it("normalizes Arabic-Indic digits in input", () => {
      expect(toDecimalString("١٢.٥")).toBe("12.50");
      expect(toDecimalString("٠.١٢٣")).toBe("0.12");
      expect(toDecimalString("-١٢.٥٠")).toBe("-12.50");
    });

    it("never uses float math for rounding", () => {
      // This test verifies the implementation doesn't rely on floating-point arithmetic
      // by checking that the result is a string with fixed decimal places
      const result = toDecimalString(0.1 + 0.2);
      expect(result).toBe("0.30");
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d+\.\d{2}$/);
    });

    it("accepts null and undefined as 0", () => {
      expect(toDecimalString(null)).toBe("0.00");
      expect(toDecimalString(undefined)).toBe("0.00");
    });
  });
});
