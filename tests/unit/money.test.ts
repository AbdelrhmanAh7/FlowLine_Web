import { describe, expect, it } from "vitest";
import { toDecimalString } from "@/server/money";

describe("src/server/money toDecimalString", () => {
  it("formats decimal strings and numbers to default scale 2", () => {
    expect(toDecimalString("12.50")).toBe("12.50");
    expect(toDecimalString(12.5)).toBe("12.50");
    expect(toDecimalString(12)).toBe("12.00");
    expect(toDecimalString("0.1")).toBe("0.10");
  });

  it("handles 1e21 scientific notation exactly without float exponent representation", () => {
    expect(toDecimalString(1e21)).toBe("1000000000000000000000.00");
    expect(toDecimalString("1e21")).toBe("1000000000000000000000.00");
    expect(toDecimalString(-1e21)).toBe("-1000000000000000000000.00");
  });

  it("rejects float noise and precision loss (0.1 + 0.2) rather than rounding", () => {
    expect(() => toDecimalString(0.1 + 0.2)).toThrow(/more than 2 decimal/);
    expect(() => toDecimalString("12.555")).toThrow(/more than 2 decimal/);
  });

  it("formats negative numbers and normalises negative zero", () => {
    expect(toDecimalString(-12.5)).toBe("-12.50");
    expect(toDecimalString("-12.50")).toBe("-12.50");
    expect(toDecimalString(-0)).toBe("0.00");
    expect(toDecimalString("-0.00")).toBe("0.00");
  });

  it("normalises Arabic-Indic digits (U+0660-U+0669) to ASCII 0-9", () => {
    expect(toDecimalString("١٢.٥")).toBe("12.50");
    expect(toDecimalString("-١٢.٥٠")).toBe("-12.50");
    expect(() => toDecimalString("٠.١٢٣")).toThrow(/more than 2 decimal/);
  });

  it("rejects Extended Arabic-Indic digits (U+06F0-U+06F9), U+066B, and grouping separators", () => {
    expect(() => toDecimalString("۱۲.۵")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("۱۲.۵۰")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("۱۰۰۰")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("١٢٫٥")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("١٢٫۵")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("1,000")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("١٬٠٠٠")).toThrow(/invalid decimal/);
  });

  it("rejects NaN, Infinity, -Infinity, and empty/whitespace strings", () => {
    expect(() => toDecimalString(NaN)).toThrow(/NaN or Infinity/);
    expect(() => toDecimalString(Infinity)).toThrow(/NaN or Infinity/);
    expect(() => toDecimalString(-Infinity)).toThrow(/NaN or Infinity/);
    expect(() => toDecimalString("")).toThrow(/invalid decimal/);
    expect(() => toDecimalString("   ")).toThrow(/invalid decimal/);
  });

  it("supports scale 0 without truncation or rounding, and custom scales", () => {
    expect(toDecimalString("12", 0)).toBe("12");
    expect(toDecimalString("12.00", 0)).toBe("12");
    expect(() => toDecimalString("12.5", 0)).toThrow(/more than 0 decimal/);
    expect(toDecimalString("12.5", 4)).toBe("12.5000");
    expect(toDecimalString(12.5, 3)).toBe("12.500");
  });

  it("rejects invalid scale values", () => {
    expect(() => toDecimalString("12.5", -1)).toThrow(/scale/);
    expect(() => toDecimalString("12.5", 21)).toThrow(/scale/);
    expect(() => toDecimalString("12.5", 1.5)).toThrow(/scale/);
  });
});
