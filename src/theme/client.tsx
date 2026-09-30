"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { primitiveHex, SEMANTIC } from "@/design/tokens";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemePreference } from "./config";

/** Stores the choice in the `fl_theme` cookie and re-renders server components (html data-theme included). */
export function useSetTheme() {
  const router = useRouter();
  return useCallback(
    (next: ThemePreference) => {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;
      router.refresh();
    },
    [router],
  );
}

/** Subscribe to theme changes: the data-theme attribute and the OS color scheme. */
function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

/** The preference the server rendered (from the cookie), so SSR and hydration agree with <html data-theme>. */
const ServerTheme = createContext<ThemePreference>("dark");

export function ServerThemeProvider({ theme, children }: { theme: ThemePreference; children: ReactNode }) {
  return <ServerTheme.Provider value={theme}>{children}</ServerTheme.Provider>;
}

/** The current preference as rendered on <html data-theme>. */
export function useThemePreference(): ThemePreference {
  const server = useContext(ServerTheme);
  return useSyncExternalStore(subscribeTheme, () => (document.documentElement.dataset.theme as ThemePreference) ?? server, () => server);
}

/** The resolved theme ("light" | "dark"), following the OS when the preference is "system". */
export function useResolvedTheme(): "light" | "dark" {
  const pref = useThemePreference();
  const systemDark = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => true,
  );
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

export interface CanvasColors {
  dot: string;
  minimapNode: string;
  minimapStroke: string;
  minimapMask: string;
}

function canvasFor(theme: "light" | "dark"): CanvasColors {
  const t = SEMANTIC[theme];
  return {
    dot: primitiveHex(t["canvas-dot"]),
    minimapNode: primitiveHex(t["minimap-node"]),
    minimapStroke: primitiveHex(t["minimap-stroke"]),
    minimapMask: t["minimap-mask"],
  };
}

/** SSR / pre-hydration snapshots: each theme's canvas colors, straight from the tokens (module-level = stable references). */
const DARK_CANVAS = canvasFor("dark");
const LIGHT_CANVAS = canvasFor("light");

let canvasCache: { key: string; colors: CanvasColors } | null = null;

/** Used values of the canvas tokens (a probe resolves the var() chain); memoized per theme state. */
function readCanvasColors(): CanvasColors {
  const key = `${document.documentElement.dataset.theme}:${window.matchMedia("(prefers-color-scheme: dark)").matches}`;
  if (canvasCache?.key === key) return canvasCache.colors;
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const read = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  const colors = { dot: read("--canvas-dot"), minimapNode: read("--minimap-node"), minimapStroke: read("--minimap-stroke"), minimapMask: read("--minimap-mask") };
  probe.remove();
  canvasCache = { key, colors };
  return colors;
}

/** Concrete colors for canvas chrome that needs them as JS props (MiniMap/Background) — read from the tokens. */
export function useCanvasColors(): CanvasColors {
  // The server (and the first, hydrating client render) use the theme the server already knows: an explicit light
  // preference gets the light palette; dark, or "system" (the OS is unknown on the server), gets dark. Once hydrated the
  // client snapshot reads the used values, so a "system" user on a light OS is corrected right after hydration.
  const server = useContext(ServerTheme);
  return useSyncExternalStore(subscribeTheme, readCanvasColors, () => (server === "light" ? LIGHT_CANVAS : DARK_CANVAS));
}
