"use client";

import type { Locale } from "@/i18n/config";
import type { ThemePreference } from "@/theme/config";

type AmbientBackgroundProps = { locale: Locale; theme: ThemePreference };

/**
 * Calm, quiet ambient background: base surface + single soft brand-tinted
 * radial glow near the top + faint dot grid that fades out.
 * Non-interactive, accessible (aria-hidden), consistent across light & dark and RTL/LTR.
 */
export function AmbientBackground({ locale, theme }: AmbientBackgroundProps) {
  return (
    <div
      className="ambient-background"
      data-locale={locale}
      data-theme={theme}
      aria-hidden="true"
    >
      <div className="ambient-glow" aria-hidden="true" />
      <div className="ambient-dots" aria-hidden="true" />
    </div>
  );
}
