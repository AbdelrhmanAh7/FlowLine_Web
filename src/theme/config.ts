/**
 * Theme contract: cookie `fl_theme`, values "light" | "dark" | "system", default "dark" when absent or invalid.
 * Applied server-side to <html data-theme=…> so there is no flash; "system" follows prefers-color-scheme in CSS.
 */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME: ThemePreference = "dark";
export const THEME_COOKIE = "fl_theme";
/** One year — the choice is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (THEME_PREFERENCES as readonly string[]).includes(v);
}

/** Any cookie value (or nothing) → a supported preference; unknown values fall back to dark. */
export function resolveTheme(v: string | null | undefined): ThemePreference {
  return isThemePreference(v) ? v : DEFAULT_THEME;
}
