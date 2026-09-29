"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/client";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/config";
import { useSetTheme, useThemePreference } from "@/theme/client";
import { cn } from "./ui";

const ICONS: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/**
 * Light / Dark / System toggle. Writes the `fl_theme` cookie and refreshes server components, so
 * <html data-theme> updates without a flash. Inline segmented control; the user menu uses radio items.
 */
export function ThemeSwitcher({ className, onChange }: { className?: string; onChange?: () => void }) {
  const t = useT();
  const theme = useThemePreference();
  const setTheme = useSetTheme();
  return (
    <div role="group" aria-label={t("theme.label")} className={cn("flex items-center gap-1", className)}>
      {THEME_PREFERENCES.map((p) => {
        const Icon = ICONS[p];
        return (
          <button
            key={p}
            type="button"
            aria-pressed={p === theme}
            title={t(`theme.${p}`)}
            onClick={() => {
              if (p !== theme) setTheme(p);
              onChange?.();
            }}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors duration-[var(--dur-base)]",
              p === theme ? "bg-card text-hi" : "text-med hover:bg-card hover:text-hi",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {t(`theme.${p}`)}
          </button>
        );
      })}
    </div>
  );
}
