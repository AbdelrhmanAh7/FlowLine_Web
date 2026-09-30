/**
 * Locale contract shared by web, e-mail and billing work (don't change without updating all of them):
 * cookie `fl_locale`, values "ar" | "en", default "ar" when absent or invalid.
 * Arabic uses Western digits: Intl formats with `ar-EG-u-nu-latn`, English with `en-US`.
 */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "fl_locale";
/** One year — the choice is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const INTL_LOCALE: Record<Locale, string> = { ar: "ar-EG-u-nu-latn", en: "en-US" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Any cookie value (or nothing) → a supported locale; unknown values fall back to Arabic. */
export function resolveLocale(v: string | null | undefined): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}
