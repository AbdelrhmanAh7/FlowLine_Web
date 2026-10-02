import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE, type ThemePreference } from "./config";

/** The request's theme preference from the `fl_theme` cookie (light when absent or invalid). Server-only. */
export async function getTheme(): Promise<ThemePreference> {
  const store = await cookies();
  return resolveTheme(store.get(THEME_COOKIE)?.value);
}
