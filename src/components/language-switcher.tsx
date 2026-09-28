"use client";

import { LOCALES, type Locale } from "@/i18n/config";
import { useLocale, useSetLocale, useT } from "@/i18n/client";
import { cx } from "./ui";

/**
 * Two-option language toggle (العربية / English). Each option is labelled in its own language so it can be found
 * whatever the current UI language is. Sets the `fl_locale` cookie and refreshes server components.
 */
export function LanguageSwitcher({ className, variant = "inline", onChange }: { className?: string; variant?: "inline" | "menu"; onChange?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const names: Record<Locale, string> = { ar: t("language.ar"), en: t("language.en") };
  return (
    <div role="group" aria-label={t("language.label")} className={cx("flex items-center gap-1", variant === "menu" && "px-1.5 py-1", className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          dir={l === "ar" ? "rtl" : "ltr"}
          {...(variant === "menu" ? { role: "menuitemradio", "aria-checked": l === locale } : { "aria-pressed": l === locale })}
          onClick={() => {
            if (l !== locale) setLocale(l);
            onChange?.();
          }}
          className={cx(
            "h-7 rounded-md px-2.5 text-sm transition-colors duration-[var(--dur-hover)]",
            l === locale ? "bg-card text-hi" : "text-med hover:bg-card hover:text-hi",
          )}
        >
          {names[l]}
        </button>
      ))}
    </div>
  );
}
