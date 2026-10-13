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
 * Convert a number or string to a fixed-scale decimal string for Mizano money fields. Pure string/digit
 * manipulation: no float arithmetic and no rounding. Arabic-Indic digits (U+0660–U+0669) are normalised to 0-9.
 *
 * Numbers are read through their shortest round-trip text, so `0.1 + 0.2` (0.30000000000000004) has more
 * decimals than a scale of 2 and is rejected; callers must pass exact values. Trailing zeros past the
 * scale ("12.500") carry no information and are accepted.
 *
 * @param value - Finite number or numeric string (plain or exponent notation).
 * @param scale - Decimal places in the result (default 2, integer 0-20).
 * @throws If value is not a number/string, is NaN/Infinity, is not a plain decimal, or has more decimals than the scale.
 */
export function toDecimalString(value: number | string, scale = 2): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 20) {
    throw new Error("toDecimalString: scale must be an integer between 0 and 20");
  }
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error("toDecimalString: value must be a number or a string");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("toDecimalString: value cannot be NaN or Infinity");
  }

  const text = String(value)
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660));
  const m = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m || (m[2] === "" && m[3] === undefined)) {
    throw new Error("toDecimalString: invalid decimal value");
  }
  const exponent = m[4] === undefined ? 0 : Number(m[4]);
  if (Math.abs(exponent) > 1000) {
    throw new Error("toDecimalString: exponent out of range");
  }

  // Shift the decimal point by the exponent on the digit string.
  let digits = m[2] + (m[3] ?? "");
  let point = m[2].length + exponent;
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  } else if (point > digits.length) {
    digits += "0".repeat(point - digits.length);
  }
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  let fraction = digits.slice(point);
  while (fraction.length > scale && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  if (fraction.length > scale) {
    // More decimals than the scale is a precision error for every scale, scale 0 included: truncating
    // would silently change the amount (12.5 → 12), which is not this helper's job.
    throw new Error(`toDecimalString: value has more than ${scale} decimal places`);
  }
  fraction = fraction.padEnd(scale, "0");

  const isZero = /^0*$/.test(integer + fraction);
  const sign = m[1] === "-" && !isZero ? "-" : "";
  return scale === 0 ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;
}
