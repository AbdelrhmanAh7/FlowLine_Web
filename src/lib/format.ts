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

/** Convert a number or decimal string to a fixed-point decimal string with the given scale. Never uses float math or toFixed. */
export function toDecimalString(value: number | string, scale: number = 2): string {
  // Convert to string and validate
  let str = String(value);

  // Reject NaN and Infinity
  if (str === "NaN" || str === "Infinity" || str === "-Infinity") {
    throw new RangeError("Value must be a finite number or decimal string");
  }

  // Map Arabic-Indic and Persian digits to ASCII, and '٫' (U+066B) to '.'
  str = str.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30))
           .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 0x30))
           .replace(/٫/g, ".");

  // Expand exponent form (e.g., "1.23e5" → "123000")
  const expMatch = str.match(/^([-+]?\d*\.?\d+)[eE]([-+]?\d+)$/);
  if (expMatch) {
    const base = expMatch[1];
    const exp = parseInt(expMatch[2], 10);
    if (exp >= 0) {
      // Move decimal point to the right
      const [integer, fractional] = base.split(".");
      const zeros = "0".repeat(exp);
      str = fractional ? integer + fractional.slice(0, exp) + zeros + fractional.slice(exp) : integer + zeros;
    } else {
      // Move decimal point to the left
      const [integer, fractional] = base.split(".");
      const negExp = -exp;
      if (fractional) {
        str = integer + (fractional.slice(0, negExp) || "0") + "." + fractional.slice(negExp);
      } else {
        str = integer + "." + "0".repeat(negExp - 1) + "0";
      }
    }
  }

  // Validate the result against the decimal pattern
  const decimalMatch = str.match(/^(-?\d*)(\.\d+)?$/);
  if (!decimalMatch) {
    throw new RangeError("Invalid decimal string");
  }
  const integerPart = decimalMatch[1] || "0";
  const fractionalPart = decimalMatch[2] || "";

  // Check if there are more fractional digits than scale
  if (fractionalPart.length > scale) {
    throw new RangeError(`Value has ${fractionalPart.length} decimal places, but scale is ${scale}`);
  }

  // Pad with zeros if needed
  const paddedFractional = fractionalPart.padEnd(scale, "0");

  // Strip leading zeros from integer part, but keep at least one digit
  let result = integerPart.replace(/^(-?0+)(?=\d)/, "$1") || "0";
  if (result !== "-" && result !== "0") {
    result = result.replace(/^0+/, "");
  }

  // Combine parts
  if (paddedFractional === "0".repeat(scale)) {
    return result;
  }
  return `${result}.${paddedFractional}`;
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
