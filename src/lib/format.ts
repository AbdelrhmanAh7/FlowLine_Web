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
