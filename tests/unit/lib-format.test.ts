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
    describe("basic decimal strings", () => {
      it("formats '12.50' at scale 2 as '12.50'", () => {
        expect(toDecimalString("12.50", 2)).toBe("12.50");
      });

      it("formats '12.5' at scale 2 as '12.50'", () => {
        expect(toDecimalString("12.5", 2)).toBe("12.50");
      });

      it("formats '12' at scale 2 as '12.00'", () => {
        expect(toDecimalString("12", 2)).toBe("12.00");
      });

      it("formats '0.1' at scale 2 as '0.10'", () => {
        expect(toDecimalString("0.1", 2)).toBe("0.10");
      });

      it("formats '0.01' at scale 2 as '0.01'", () => {
        expect(toDecimalString("0.01", 2)).toBe("0.01");
      });

      it("formats '1e21' at scale 2 as '1000000000000000000000.00'", () => {
        expect(toDecimalString("1e21", 2)).toBe("1000000000000000000000.00");
      });

      it("formats '1.5e3' at scale 2 as '1500.00'", () => {
        expect(toDecimalString("1.5e3", 2)).toBe("1500.00");
      });

      it("formats '-12.50' at scale 2 as '-12.50'", () => {
        expect(toDecimalString("-12.50", 2)).toBe("-12.50");
      });

      it("formats '0' at scale 2 as '0.00'", () => {
        expect(toDecimalString("0", 2)).toBe("0.00");
      });

      it("formats '0.0' at scale 2 as '0.00'", () => {
        expect(toDecimalString("0.0", 2)).toBe("0.00");
      });

      it("formats '0.00' at scale 2 as '0.00'", () => {
        expect(toDecimalString("0.00", 2)).toBe("0.00");
      });
    });

    describe("scale handling", () => {
      it("formats '12.51' at scale 2 as '12.51' (no rounding)", () => {
        expect(toDecimalString("12.51", 2)).toBe("12.51");
      });

      it("formats '12.599' at scale 2 is rejected (has more than 2 decimals)", () => {
        expect(() => toDecimalString("12.599", 2)).toThrow(/more than 2 decimal places/);
      });

      it("formats '12.5' at scale 3 as '12.500'", () => {
        expect(toDecimalString("12.5", 3)).toBe("12.500");
      });

      it("formats '12' at scale 3 as '12.000'", () => {
        expect(toDecimalString("12", 3)).toBe("12.000");
      });

      it("formats '0' at scale 3 as '0.000'", () => {
        expect(toDecimalString("0", 3)).toBe("0.000");
      });

      it("formats '0.1' at scale 3 as '0.100'", () => {
        expect(toDecimalString("0.1", 3)).toBe("0.100");
      });
    });

    describe("exponent handling", () => {
      it("formats '1e2' at scale 2 as '100.00'", () => {
        expect(toDecimalString("1e2", 2)).toBe("100.00");
      });

      it("formats '1e-2' at scale 2 as '0.01'", () => {
        expect(toDecimalString("1e-2", 2)).toBe("0.01");
      });

      it("formats '1e-5' at scale 2 is rejected (has more than 2 decimals)", () => {
        expect(() => toDecimalString("1e-5", 2)).toThrow(/more than 2 decimal places/);
      });

      it("formats '1.23e-4' at scale 2 is rejected (has more than 2 decimals)", () => {
        expect(() => toDecimalString("1.23e-4", 2)).toThrow(/more than 2 decimal places/);
      });

      it("formats '1.23e5' at scale 2 as '123000.00'", () => {
        expect(toDecimalString("1.23e5", 2)).toBe("123000.00");
      });

      it("formats '1.23e-6' at scale 2 is rejected (has more than 2 decimals)", () => {
        expect(() => toDecimalString("1.23e-6", 2)).toThrow(/more than 2 decimal places/);
      });
    });

    describe("negative numbers", () => {
      it("formats '-12.5' at scale 2 as '-12.50'", () => {
        expect(toDecimalString("-12.5", 2)).toBe("-12.50");
      });

      it("formats '-0.1' at scale 2 as '-0.10'", () => {
        expect(toDecimalString("-0.1", 2)).toBe("-0.10");
      });

      it("formats '-0' at scale 2 as '0.00' (negative zero normalized to zero)", () => {
        expect(toDecimalString("-0", 2)).toBe("0.00");
      });

      it("formats '-0.0' at scale 2 as '0.00' (negative zero normalized to zero)", () => {
        expect(toDecimalString("-0.0", 2)).toBe("0.00");
      });

      it("formats '-0.00' at scale 2 as '0.00' (negative zero normalized to zero)", () => {
        expect(toDecimalString("-0.00", 2)).toBe("0.00");
      });

      it("formats '-1e2' at scale 2 as '-100.00'", () => {
        expect(toDecimalString("-1e2", 2)).toBe("-100.00");
      });

      it("formats '-1e-2' at scale 2 as '-0.01'", () => {
        expect(toDecimalString("-1e-2", 2)).toBe("-0.01");
      });
    });

    describe("Arabic-Indic digits normalization", () => {
      it("formats '١٢.٥٠' (Arabic-Indic) at scale 2 as '12.50' (normalized to Western digits)", () => {
        expect(toDecimalString("١٢.٥٠", 2)).toBe("12.50");
      });

      it("formats '٠.١' (Arabic-Indic) at scale 2 as '0.10' (normalized to Western digits)", () => {
        expect(toDecimalString("٠.١", 2)).toBe("0.10");
      });

      it("formats '١٢٥٠' (Arabic-Indic) at scale 2 as '1250.00' (normalized to Western digits)", () => {
        expect(toDecimalString("١٢٥٠", 2)).toBe("1250.00");
      });

      it("formats '-١٢.٥' (Arabic-Indic) at scale 2 as '-12.50' (normalized to Western digits)", () => {
        expect(toDecimalString("-١٢.٥", 2)).toBe("-12.50");
      });

      it("formats '١٢.٥٠٠' (Arabic-Indic) at scale 2 as '12.50' (trailing zeros trimmed)", () => {
        expect(toDecimalString("١٢.٥٠٠", 2)).toBe("12.50");
      });

      it("rejects Persian (Extended Arabic-Indic) digits '۱۲.۵' (not normalised)", () => {
        expect(() => toDecimalString("۱۲.۵", 2)).toThrow(/invalid decimal value/);
      });

      it("rejects the Arabic decimal separator '٫' in '١٢٫٥٠' (not normalised)", () => {
        expect(() => toDecimalString("١٢٫٥٠", 2)).toThrow(/invalid decimal value/);
      });
    });

    describe("no float rounding verification", () => {
      it("rejects the float artifact number 0.1 + 0.2 at scale 2 instead of rounding it to '0.30'", () => {
        expect(() => toDecimalString(0.1 + 0.2, 2)).toThrow(/more than 2 decimal places/);
      });

      it("formats the number 1e21 exactly, never in exponent notation", () => {
        expect(toDecimalString(1e21, 2)).toBe("1000000000000000000000.00");
      });

      it("formats the number 12.5 at scale 2 as '12.50' (padded, not rounded)", () => {
        expect(toDecimalString(12.5, 2)).toBe("12.50");
      });

      it("formats 12.51 at scale 2 as '12.51' (exact, not rounded to '12.5')", () => {
        expect(toDecimalString(12.51, 2)).toBe("12.51");
      });

      it("rejects 12.599 at scale 2 instead of rounding it to '12.60'", () => {
        expect(() => toDecimalString(12.599, 2)).toThrow(/more than 2 decimal places/);
      });

      it("formats 12.500 at scale 2 as '12.50' (the trailing zero beyond the scale is trimmed)", () => {
        expect(toDecimalString(12.500, 2)).toBe("12.50");
      });

      it("formats the number 0.3 at scale 2 as '0.30' (the exact float, not a rounded artifact)", () => {
        expect(toDecimalString(0.3, 2)).toBe("0.30");
      });

      it("formats the number -12.5 at scale 2 as '-12.50' (number path keeps the sign)", () => {
        expect(toDecimalString(-12.5, 2)).toBe("-12.50");
      });

      it("formats the number -0 at scale 2 as '0.00' (negative zero is normalized on the number path too)", () => {
        expect(toDecimalString(-0, 2)).toBe("0.00");
      });

      it("uses scale 2 as the default (number path)", () => {
        expect(() => toDecimalString(0.1 + 0.2)).toThrow(/more than 2 decimal places/);
        expect(toDecimalString(12.5)).toBe("12.50");
      });
    });

    describe("bidi control marks (intentional rejection, see the JSDoc)", () => {
      it("rejects a leading RLM (U+200F) rather than stripping it", () => {
        expect(() => toDecimalString("\u200f12.50", 2)).toThrow(/invalid decimal value/);
      });

      it("rejects a leading LRM (U+200E) and ALM (U+061C) too", () => {
        expect(() => toDecimalString("\u200e12.50", 2)).toThrow(/invalid decimal value/);
        expect(() => toDecimalString("\u061c12.50", 2)).toThrow(/invalid decimal value/);
      });
    });

    describe("edge cases and error handling", () => {
      it("rejects NaN as number", () => {
        expect(() => toDecimalString(NaN, 2)).toThrow(/NaN or Infinity/);
      });

      it("rejects Infinity as number", () => {
        expect(() => toDecimalString(Infinity, 2)).toThrow(/NaN or Infinity/);
      });

      it("rejects negative infinity as number", () => {
        expect(() => toDecimalString(-Infinity, 2)).toThrow(/NaN or Infinity/);
      });

      it("rejects non-numeric strings", () => {
        expect(() => toDecimalString("abc", 2)).toThrow(/invalid decimal value/);
      });

      it("rejects empty strings", () => {
        expect(() => toDecimalString("", 2)).toThrow(/invalid decimal value/);
      });

      it("rejects strings with only a sign", () => {
        expect(() => toDecimalString("-", 2)).toThrow(/invalid decimal value/);
      });

      it("rejects scale < 0", () => {
        expect(() => toDecimalString("12.5", -1)).toThrow(/scale must be an integer/);
      });

      it("rejects scale > 20", () => {
        expect(() => toDecimalString("12.5", 21)).toThrow(/scale must be an integer/);
      });

      it("rejects non-integer scale", () => {
        expect(() => toDecimalString("12.5", 2.5)).toThrow(/scale must be an integer/);
      });

      it("rejects scale as a string", () => {
        expect(() => toDecimalString("12.5", "2" as unknown as number)).toThrow(/scale must be an integer/);
      });

      it("rejects scale as null", () => {
        expect(() => toDecimalString("12.5", null as unknown as number)).toThrow(/scale must be an integer/);
      });

      it("rejects value as null", () => {
        expect(() => toDecimalString(null as unknown as number, 2)).toThrow(/value must be a number/);
      });

      it("rejects value as undefined", () => {
        expect(() => toDecimalString(undefined as unknown as number, 2)).toThrow(/value must be a number/);
      });

      it("rejects value as object", () => {
        expect(() => toDecimalString({} as unknown as number, 2)).toThrow(/value must be a number/);
      });

      it("rejects value as array", () => {
        expect(() => toDecimalString([] as unknown as number, 2)).toThrow(/value must be a number/);
      });

      it("rejects exponent > 1000", () => {
        expect(() => toDecimalString("1e1001", 2)).toThrow(/exponent out of range/);
      });

      it("rejects exponent < -1000", () => {
        expect(() => toDecimalString("1e-1001", 2)).toThrow(/exponent out of range/);
      });

      it("rejects value with more decimals than scale", () => {
        expect(() => toDecimalString("12.345", 2)).toThrow(/more than 2 decimal places/);
      });

      it("accepts value with exactly scale decimals", () => {
        expect(toDecimalString("12.34", 2)).toBe("12.34");
      });

      it("accepts value with fewer decimals than scale", () => {
        expect(toDecimalString("12.3", 2)).toBe("12.30");
      });

      it("accepts value with more decimals than scale but trailing zeros", () => {
        expect(toDecimalString("12.350", 2)).toBe("12.35");
      });
    });

    describe("scale 0 (integer) cases", () => {
      it("rejects '12.5' at scale 0 (has more than 0 decimal places, no truncation)", () => {
        expect(() => toDecimalString("12.5", 0)).toThrow(/more than 0 decimal places/);
      });

      it("rejects '12.51' at scale 0 (no truncation)", () => {
        expect(() => toDecimalString("12.51", 0)).toThrow(/more than 0 decimal places/);
      });

      it("formats '12.0' at scale 0 as '12' (a trailing zero is not extra precision)", () => {
        expect(toDecimalString("12.0", 0)).toBe("12");
      });

      it("formats '12.00' at scale 0 as '12' (no decimal point)", () => {
        expect(toDecimalString("12.00", 0)).toBe("12");
      });

      it("rejects '0.5' at scale 0 (no truncation)", () => {
        expect(() => toDecimalString("0.5", 0)).toThrow(/more than 0 decimal places/);
      });

      it("formats '0.0' at scale 0 as '0' (no decimal point)", () => {
        expect(toDecimalString("0.0", 0)).toBe("0");
      });

      it("rejects '-12.5' at scale 0 (no truncation, sign not silently dropped)", () => {
        expect(() => toDecimalString("-12.5", 0)).toThrow(/more than 0 decimal places/);
      });

      it("rejects '-0.5' at scale 0 (no truncation to a lossy zero)", () => {
        expect(() => toDecimalString("-0.5", 0)).toThrow(/more than 0 decimal places/);
      });
    });
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

    it("rejects Persian digits (U+06F0-U+06F9) and the Arabic decimal separator (U+066B)", () => {
      expect(() => toDecimalString("۱۲.۵")).toThrow(/invalid decimal/);
      expect(() => toDecimalString("١٢٫٥")).toThrow(/invalid decimal/);
      expect(() => toDecimalString("١٢٫۵")).toThrow(/invalid decimal/);
    });

    it("pins rejection of Persian digits (U+06F0-U+06F9) and U+066B", () => {
      expect(() => toDecimalString("۱۲.۵")).toThrow(/invalid decimal/);
      expect(() => toDecimalString("۱۲.۵۰")).toThrow(/invalid decimal/);
      expect(() => toDecimalString("۱۰۰۰")).toThrow(/invalid decimal/);
      expect(() => toDecimalString("1,000")).toThrow(/invalid decimal/);
      expect(() => toDecimalString("١٢٫٥")).toThrow(/invalid decimal/);
    });

    it("rejects malformed and non-numeric input", () => {
      for (const bad of ["", "  ", "abc", "12.", ".", "1,5", "1.2.3", "12 5", "1e", "0x10", "--1", "1e5000", "١٢٫٥", "۱۲.۵"]) {
        expect(() => toDecimalString(bad), JSON.stringify(bad)).toThrow();
      }
      expect(() => toDecimalString(null as unknown as number)).toThrow(/number or a string/);
      expect(() => toDecimalString(undefined as unknown as number)).toThrow(/number or a string/);
      expect(() => toDecimalString(10n as unknown as number)).toThrow(/number or a string/);
    });
  });
});
