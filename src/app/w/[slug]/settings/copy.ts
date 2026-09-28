/**
 * User-facing strings for workspace settings, keyed by locale. The app is becoming
 * Arabic-first/RTL: the locale comes from the `fl_locale` cookie (default "ar").
 * NEW strings go here as { ar, en } pairs; the dedicated i18n system (another
 * workstream) will take over lookup and pluralization later.
 */
export type Locale = "ar" | "en";

export function localeFromCookieHeader(cookie: string | null | undefined): Locale {
  const m = /(?:^|;\s*)fl_locale=([a-z-]+)/i.exec(cookie ?? "");
  return m?.[1]?.toLowerCase().startsWith("en") ? "en" : "ar";
}

export interface CopyEntry {
  ar: string;
  en: string;
}

export function pick(entry: CopyEntry, locale: Locale): string {
  return locale === "en" ? entry.en : entry.ar;
}

/** Strings introduced with the Paddle billing provider (Phase 4). */
export const billingCopy = {
  sandboxBadge: { ar: "البيئة التجريبية", en: "Sandbox" },
  sandboxTitle: {
    ar: "تُنفَّذ المدفوعات عبر البيئة التجريبية للمزوّد؛ لا تُحصَّل أي رسوم حقيقية",
    en: "Payments run in the provider's sandbox environment; no real charges",
  },
} as const satisfies Record<string, CopyEntry>;
