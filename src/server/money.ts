import { toDecimalString as formatToDecimalString } from "@/lib/format";

/**
 * Convert a number or string to a fixed-scale decimal string for Mizano money fields. Pure string/digit
 * manipulation: no float arithmetic and no rounding. Arabic-Indic digits (U+0660–U+0669) are normalised to 0-9.
 *
 * Numbers are read through their shortest round-trip text, so `0.1 + 0.2` (0.30000000000000004) has more
 * decimals than a scale of 2 and is rejected; callers must pass exact values. Trailing zeros past the
 * scale ("12.500") carry no information and are accepted.
 *
 * The value is trimmed, but bidi control marks (U+200E LRM, U+200F RLM, U+061C ALM) are deliberately not
 * stripped: a value carrying one is rejected as invalid rather than silently cleaned, so callers pass the
 * parsed amount rather than text copied straight out of an RTL view.
 *
 * @param value - Finite number or numeric string (plain or exponent notation).
 * @param scale - Decimal places in the result (default 2, integer 0-20).
 * @throws If value is not a number/string, is NaN/Infinity, is not a plain decimal, or has more decimals than the scale.
 */
export function toDecimalString(value: number | string, scale = 2): string {
  return formatToDecimalString(value, scale);
}
