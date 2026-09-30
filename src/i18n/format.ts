import { intlLocale, type Locale } from "./config";

/**
 * Locale-aware formatting. Arabic keeps Western digits (0-9) via the `-u-nu-latn` extension, so numbers,
 * IDs and timestamps read the same in both languages.
 */

type DateInput = string | number | Date;
const toDate = (v: DateInput) => (v instanceof Date ? v : new Date(v));

export function formatNumber(locale: Locale, n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(locale), opts).format(n);
}

/** 0.953 → "95.3%" (one decimal, like the rest of the app). */
export function formatPercent(locale: Locale, v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat(intlLocale(locale), { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
}

export function formatDate(locale: Locale, value: DateInput, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  return new Intl.DateTimeFormat(intlLocale(locale), opts).format(toDate(value));
}

/** "5m ago" / "قبل 5 دقائق". Under 10 s reads "now"; null reads "never" (caller supplies the words). */
export function formatRelative(locale: Locale, value: DateInput | null | undefined, now: number = Date.now(), words?: { never: string }): string {
  if (value == null) return words?.never ?? "—";
  const t = toDate(value).getTime();
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { style: "narrow", numeric: "auto" });
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return rtf.format(0, "second");
  if (s < 60) return rtf.format(-s, "second");
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

/** 850 → "850ms" / "850 ملي ث"; 12 300 → "12.3s"; 125 000 → "2m 5s". */
export function formatDuration(locale: Locale, ms: number | null | undefined): string {
  if (ms == null) return "—";
  const unit = (n: number, u: "millisecond" | "second" | "minute", digits = 0) =>
    new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: u, unitDisplay: "narrow", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  if (ms < 1000) return unit(ms, "millisecond");
  if (ms < 60_000) return unit(ms / 1000, "second", 1);
  return `${unit(Math.floor(ms / 60000), "minute")} ${unit(Math.round((ms % 60000) / 1000), "second")}`;
}
