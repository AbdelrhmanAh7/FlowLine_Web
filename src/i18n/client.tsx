"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { dirOf, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./config";
import { createTranslator, type Translator } from "./translate";

const I18nContext = createContext<Translator | null>(null);

/** Provides the request's locale (read on the server from the cookie) to client components. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/** `t(key, vars)`, `t.plural(key, n)`, `t.rich(...)` and locale-aware formatters. */
export function useT(): Translator {
  const t = useContext(I18nContext);
  if (!t) throw new Error("useT must be used inside <I18nProvider>");
  return t;
}

export function useLocale(): Locale {
  return useT().locale;
}

export function useDir(): "rtl" | "ltr" {
  return dirOf(useLocale());
}

/** Stores the choice in the `fl_locale` cookie and re-renders server components (html lang/dir included). */
export function useSetLocale() {
  const router = useRouter();
  return useCallback(
    (next: Locale) => {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
      router.refresh();
    },
    [router],
  );
}
