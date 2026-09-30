"use client";

import { LOCALES, type Locale } from "@/i18n/config";
import { useLocale, useSetLocale, useT } from "@/i18n/client";
import { cx } from "./ui";

/**
 * Density of the inline switcher (ignored by the `menu` variant).
 * - `false` (default): the 28px-tall buttons every existing caller uses.
 * - `true`: 32px-tall touch targets with tighter padding.
 * - `"responsive"`: touch-sized below the `xl` breakpoint, the default size from `xl` up (pure CSS, identical server/client markup).
 * The labels never change: each language stays named in its own language ("العربية" / "English"), so the accessible names are the same in every mode.
 */
export type LanguageSwitcherDensity = boolean | "responsive";

/**
 * Two-option language toggle (العربية / English). Each option is labelled in its own language so it can be found
 * whatever the current UI language is. Sets the `fl_locale` cookie and refreshes server components.
 */
export function LanguageSwitcher({
  className,
  variant = "inline",
  onChange,
  compact = false,
}: {
  className?: string;
  variant?: "inline" | "menu";
  onChange?: () => void;
  compact?: LanguageSwitcherDensity;
}) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const names: Record<Locale, string> = { ar: t("language.ar"), en: t("language.en") };
  // The menu variant keeps its own row sizing; density only applies to the inline toggle.
  const density = variant === "menu" ? false : compact;
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
            "rounded-md text-sm transition-colors duration-[var(--dur-hover)]",
            density === false && "h-8 px-2.5",
            density === true && "h-10 px-2",
            density === "responsive" && "h-10 px-2 xl:h-8 xl:px-2.5",
            l === locale ? "bg-card text-hi" : "text-med hover:bg-card hover:text-hi",
          )}
        >
          {names[l]}
        </button>
      ))}
    </div>
  );
}
