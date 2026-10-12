import type { Locale } from "@/i18n/config";
import { formatDuration, formatRelative } from "@/i18n/format";
import { CATALOGUES } from "@/i18n/translate";

/**
 * "5m ago" / "قبل 5 دقائق" (locale-aware via the i18n formatters; English by default for callers that
 * haven't been translated yet). In translated components prefer `t.relative()`.
 */
export function timeAgo(value: string | Date | null | undefined, now = Date.now(), locale: Locale = "en"): string {
  return formatRelative(locale, value || null, now, { never: CATALOGUES[locale].common.never });
}

/** 850 → "850ms", 12 300 → "12.3s", 125 000 → "2m 5s" (Arabic units with `locale: "ar"`). Prefer `t.duration()`. */
export function duration(ms: number | null | undefined, locale: Locale = "en"): string {
  return formatDuration(locale, ms);
}

export function percent(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function pretty(value: unknown): string {
  if (value === undefined) return "—";
  return JSON.stringify(value, null, 2);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Convert a number or string to a decimal string with a fixed scale, never using float math for rounding.
 * Used by every Mizano step to ensure money values are always formatted consistently.
 *
 * @param value - Number or string to convert. null/undefined are treated as 0.
 * @param scale - Number of decimal places (default: 2).
 * @returns Decimal string with exactly `scale` decimal places.
 * @throws If value is NaN, Infinity, -Infinity, or has more decimals than the scale.
 */
export function toDecimalString(value: number | string | null | undefined, scale: number = 2): string {
  // Handle null/undefined as 0
  if (value == null) {
    return `0.${"0".repeat(scale)}`;
  }

  // Convert to string and normalize Arabic-Indic digits to Western digits
  let strValue = String(value);

  // Normalize Arabic-Indic digits (٠-٩) to Western digits (0-9)
  strValue = strValue.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));

  // Reject NaN and Infinity
  if (strValue === "NaN" || strValue === "Infinity" || strValue === "-Infinity") {
    throw new Error("toDecimalString: value cannot be NaN or Infinity");
  }

  // Handle scientific notation (e.g., "1e+21") by parsing manually to preserve precision
  if (strValue.includes("e") || strValue.includes("E")) {
    const match = strValue.match(/^([+-]?[\d.]+)[eE]([+-]?\d+)$/);
    if (!match) {
      throw new Error("toDecimalString: invalid scientific notation");
    }

    const mantissa = match[1];
    const exponent = parseInt(match[2], 10);

    // Parse mantissa into integer and fractional parts
    const mantissaParts = mantissa.split(".");
    let integerPart = mantissaParts[0] || "0";
    let fractionalPart = mantissaParts[1] || "";

    // Handle negative sign
    const isNegative = integerPart.startsWith("-");
    if (isNegative) {
      integerPart = integerPart.slice(1);
    }

    // Combine all digits and determine total digit count
    const allDigits = integerPart + fractionalPart;
    const totalDigits = allDigits.length;

    // Adjust decimal position based on exponent
    // The decimal point starts after the first digit of integerPart
    const decimalPos = integerPart.length;

    // Calculate the new decimal position after applying the exponent
    const newDecimalPos = decimalPos + exponent;

    // Reconstruct the number with the new decimal position
    if (newDecimalPos <= 0) {
      // Decimal point is before the first digit (e.g., 0.00123 with scale 2)
      const zerosNeeded = -newDecimalPos + 1; // +1 for the leading zero
      const leadingZeros = "0".repeat(Math.max(0, zerosNeeded - 1));
      integerPart = "0";
      fractionalPart = leadingZeros + allDigits;
    } else if (newDecimalPos >= totalDigits) {
      // Decimal point is after the last digit (e.g., 123.45 with scale 2)
      // When the decimal point is after all digits, the number is an integer
      // The fractional part is all zeros
      fractionalPart = "0".repeat(scale);
    } else {
      // Decimal point is in the middle (e.g., 12.345 with scale 2)
      const digitsBeforeDecimal = allDigits.slice(0, newDecimalPos);
      const digitsAfterDecimal = allDigits.slice(newDecimalPos);
      integerPart = digitsBeforeDecimal;
      fractionalPart = digitsAfterDecimal;
    }

    // Reconstruct the number
    if (isNegative) {
      strValue = `-${integerPart}.${fractionalPart}`;
    } else {
      strValue = `${integerPart}.${fractionalPart}`;
    }
  }

  // Parse the string, keeping it as a string to avoid float arithmetic
  // We need to split into integer and fractional parts
  const parts = strValue.split(".");
  const integerPart = parts[0] || "0";
  const fractionalPart = parts[1] || "";

  // Reject if fractional part is empty but there's a decimal point (e.g., "12.")
  if (parts.length > 1 && parts[1] === "" && parts.length === 2) {
    throw new Error("toDecimalString: invalid decimal value");
  }

  // Pad fractional part to scale (truncate if longer than scale)
  const truncatedFractional = fractionalPart.slice(0, scale);
  const paddedFractional = truncatedFractional + "0".repeat(scale - truncatedFractional.length);

  // Reconstruct the decimal string
  return `${integerPart}.${paddedFractional}`;
}
