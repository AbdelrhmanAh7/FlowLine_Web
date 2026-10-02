import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { createTranslator, type Translator } from "./translate";
import { getPublishedCopy } from "@/server/platform-copy";

/** The request's UI language from the `fl_locale` cookie (Arabic when absent or invalid). Server-only. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Translator for server components, metadata and route handlers. */
export async function getT(): Promise<Translator> {
  const [locale, overrides] = await Promise.all([getLocale(), getPublishedCopy()]);
  return createTranslator(locale, overrides);
}
