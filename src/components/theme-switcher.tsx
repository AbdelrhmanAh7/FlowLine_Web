"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/client";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/config";
import { useSetTheme, useThemePreference } from "@/theme/client";
import { cn } from "./ui";

const ICONS: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/**
 * Density of the switcher.
 * - `false` (default): icon + text label, exactly as the auth form, onboarding wizard and style guide render it.
 * - `true`: icon-only at every width, 32px touch targets. The root font size is 13px (`--text-base`), so Tailwind's rem
 *   scale is 13/16 of nominal: `h-10`/`min-w-10` = 32.5px (`h-8` is 26px, which the labelled buttons use: at least the WCAG 2.5.8 24px minimum).
 * - `"responsive"`: icon-only below the `xl` breakpoint, icon + label from `xl` up. Pure CSS: the server and client markup are identical.
 *
 * Icon-only buttons carry `aria-label` = the visible label text of the default mode ("Light", "Dark", "System" / "فاتح"…), so their accessible
 * name (and every spec that finds them by name) is the same in all three modes; `title` and `aria-pressed` are kept.
 */
export type ThemeSwitcherDensity = boolean | "responsive";

/**
 * Light / Dark / System toggle. Writes the `fl_theme` cookie and refreshes server components, so
 * <html data-theme> updates without a flash. Inline segmented control; the user menu uses radio items.
 */
export function ThemeSwitcher({ className, onChange, compact = false }: { className?: string; onChange?: () => void; compact?: ThemeSwitcherDensity }) {
  const t = useT();
  const theme = useThemePreference();
  const setTheme = useSetTheme();
  return (
    <div role="group" aria-label={t("theme.label")} className={cn("flex items-center gap-1", className)}>
      {THEME_PREFERENCES.map((p) => {
        const Icon = ICONS[p];
        const label = t(`theme.${p}`);
        return (
          <button
            key={p}
            type="button"
            aria-pressed={p === theme}
            aria-label={compact ? label : undefined}
            title={label}
            onClick={() => {
              if (p !== theme) setTheme(p);
              onChange?.();
            }}
            className={cn(
              "flex items-center rounded-md text-sm transition-colors duration-[var(--dur-base)]",
              compact === false && "h-8 gap-1.5 px-2.5",
              compact === true && "h-10 min-w-10 justify-center",
              compact === "responsive" && "h-10 min-w-10 justify-center xl:h-8 xl:gap-1.5 xl:px-2.5",
              p === theme ? "bg-card text-hi" : "text-med hover:bg-card hover:text-hi",
            )}
          >
            <Icon className={cn(compact === false ? "size-3.5" : compact === true ? "size-4" : "size-4 xl:size-3.5")} aria-hidden />
            {compact === false ? label : compact === "responsive" ? <span className="hidden xl:inline">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
