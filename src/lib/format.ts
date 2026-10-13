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

const MAX_EXPONENT = 1000;

/**
 * Convert a number or decimal string to an exact fixed-point decimal string with `scale` fractional digits
 * ("12.5" → "12.50"). Pure string/digit manipulation: no float math, no `toFixed`, no rounding. Throws a
 * `RangeError` for NaN/Infinity, malformed input, a bad scale, or a value needing more than `scale` decimals
 * (trailing zeros are not precision: "12.500" is fine at scale 2). Accepts exponent form (`1e21`, `"1.5e-3"`)
 * and Arabic-Indic / Persian digits with the Arabic decimal separator ("١٢٫٥٠").
 */
export function toDecimalString(value: number | string, scale: number = 2): string {
  if (!Number.isInteger(scale) || scale < 0) throw new RangeError("Scale must be a non-negative integer");
  if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError("Value must be finite");

  const ascii = String(value)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
  const m = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(ascii);
  if (!m || (m[2] === "" && m[3] === undefined)) throw new RangeError("Invalid decimal string");
  const negative = m[1] === "-";
  const exp = m[4] === undefined ? 0 : Number(m[4]);
  if (Math.abs(exp) > MAX_EXPONENT) throw new RangeError("Exponent out of range");

  // Shift the decimal point by the exponent on the digit string.
  const digits = m[2] + (m[3] ?? "");
  const point = m[2].length + exp;
  let intPart: string;
  let fracPart: string;
  if (point <= 0) {
    intPart = "";
    fracPart = "0".repeat(-point) + digits;
  } else if (point >= digits.length) {
    intPart = digits + "0".repeat(point - digits.length);
    fracPart = "";
  } else {
    intPart = digits.slice(0, point);
    fracPart = digits.slice(point);
  }
  intPart = intPart.replace(/^0+/, "") || "0";
  fracPart = fracPart.replace(/0+$/, "");

  if (fracPart.length > scale) {
    throw new RangeError(`Value has ${fracPart.length} decimal places, but scale is ${scale}`);
  }
  const isZero = intPart === "0" && fracPart === "";
  const sign = negative && !isZero ? "-" : "";
  return scale === 0 ? `${sign}${intPart}` : `${sign}${intPart}.${fracPart.padEnd(scale, "0")}`;
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
