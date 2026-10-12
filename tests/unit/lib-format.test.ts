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
    it("pads numbers and strings to the default scale of 2", () => {
      expect(toDecimalString(12.5)).toBe("12.50");
      expect(toDecimalString("12.50")).toBe("12.50");
      expect(toDecimalString("12.5")).toBe("12.50");
      expect(toDecimalString(0)).toBe("0.00");
      expect(toDecimalString("10")).toBe("10.00");
      expect(toDecimalString(".5")).toBe("0.50");
      expect(toDecimalString("007.1")).toBe("7.10");
      expect(toDecimalString(123456789.12)).toBe("123456789.12");
    });

    it("respects the scale parameter", () => {
      expect(toDecimalString(12.5, 3)).toBe("12.500");
      expect(toDecimalString(0.1, 1)).toBe("0.1");
      expect(toDecimalString("0.1234", 4)).toBe("0.1234");
      expect(toDecimalString("12", 0)).toBe("12");
      expect(() => toDecimalString("12.5", 0)).toThrow(/more than 0 decimal/);
      expect(() => toDecimalString(1, -1)).toThrow(/scale/);
      expect(() => toDecimalString(1, 1.5)).toThrow(/scale/);
    });

    it("rejects NaN and Infinity", () => {
      expect(() => toDecimalString(NaN)).toThrow(/NaN or Infinity/);
      expect(() => toDecimalString(Infinity)).toThrow(/NaN or Infinity/);
      expect(() => toDecimalString(-Infinity)).toThrow(/NaN or Infinity/);
      expect(() => toDecimalString("NaN")).toThrow();
      expect(() => toDecimalString("Infinity")).toThrow();
    });

    it("rejects more decimals than the scale instead of truncating or rounding", () => {
      expect(() => toDecimalString("12.345")).toThrow(/more than 2 decimal/);
      expect(() => toDecimalString(0.123)).toThrow(/more than 2 decimal/);
      expect(() => toDecimalString(0.12345, 3)).toThrow(/more than 3 decimal/);
      expect(() => toDecimalString("1.999")).toThrow();
    });

    it("rejects float noise such as 0.1 + 0.2", () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(() => toDecimalString(0.1 + 0.2)).toThrow(/more than 2 decimal/);
      expect(toDecimalString(0.3)).toBe("0.30");
      expect(toDecimalString("0.1")).toBe("0.10");
    });

    it("accepts trailing zeros past the scale since no information is lost", () => {
      expect(toDecimalString("12.500")).toBe("12.50");
      expect(toDecimalString("12.5000", 1)).toBe("12.5");
    });

    it("handles negative numbers", () => {
      expect(toDecimalString(-12.5)).toBe("-12.50");
      expect(toDecimalString("-0.12")).toBe("-0.12");
      expect(toDecimalString(-10)).toBe("-10.00");
      expect(toDecimalString("+5")).toBe("5.00");
    });

    it("never emits a negative zero", () => {
      expect(toDecimalString(-0)).toBe("0.00");
      expect(toDecimalString("-0")).toBe("0.00");
      expect(toDecimalString("-0.00")).toBe("0.00");
      expect(toDecimalString("-0.001", 3)).toBe("-0.001");
    });

    it("expands very large numbers exactly (1e21)", () => {
      expect(toDecimalString(1e21)).toBe("1000000000000000000000.00");
      expect(toDecimalString(1.5e21)).toBe("1500000000000000000000.00");
      expect(toDecimalString(-1e21)).toBe("-1000000000000000000000.00");
      expect(toDecimalString("1e21")).toBe("1000000000000000000000.00");
      expect(toDecimalString("1.2345e3")).toBe("1234.50");
      expect(toDecimalString("12345678901234567890.12")).toBe("12345678901234567890.12");
    });

    it("expands negative exponents and rejects those below the scale", () => {
      expect(toDecimalString("5e-1")).toBe("0.50");
      expect(toDecimalString("1.5e-2", 3)).toBe("0.015");
      expect(toDecimalString(1e-7, 7)).toBe("0.0000001");
      expect(() => toDecimalString("1.5e-2")).toThrow(/more than 2 decimal/);
      expect(() => toDecimalString(1e-7)).toThrow(/more than 2 decimal/);
    });

    it("normalises Arabic-Indic digits", () => {
      expect(toDecimalString("١٢.٥")).toBe("12.50");
      expect(toDecimalString("-١٢.٥٠")).toBe("-12.50");
      expect(() => toDecimalString("٠.١٢٣")).toThrow(/more than 2 decimal/);
    });

    it("rejects malformed and non-numeric input", () => {
      for (const bad of ["", "  ", "abc", "12.", ".", "1,5", "1.2.3", "12 5", "1e", "0x10", "--1", "1e5000", "١٢٫٥"]) {
        expect(() => toDecimalString(bad), JSON.stringify(bad)).toThrow();
      }
      expect(() => toDecimalString(null as unknown as number)).toThrow(/number or a string/);
      expect(() => toDecimalString(undefined as unknown as number)).toThrow(/number or a string/);
      expect(() => toDecimalString(10n as unknown as number)).toThrow(/number or a string/);
    });
  });
});
