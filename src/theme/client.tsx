"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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

/** The current preference as rendered on <html data-theme>. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    () => () => {},
    () => (document.documentElement.dataset.theme as ThemePreference) ?? "dark",
    () => "dark",
  );
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

/** Concrete colors for canvas chrome that needs them as JS props (MiniMap/Background) — read from the tokens. */
export function useCanvasColors(): { dot: string; minimapNode: string; minimapStroke: string; minimapMask: string } {
  const theme = useResolvedTheme();
  const [colors, setColors] = useState({ dot: "", minimapNode: "", minimapStroke: "", minimapMask: "" });
  useEffect(() => {
    // Custom properties keep their var() chain unresolved in getComputedStyle; a probe element gives used values.
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const read = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };
    setColors({ dot: read("--canvas-dot"), minimapNode: read("--minimap-node"), minimapStroke: read("--minimap-stroke"), minimapMask: read("--minimap-mask") });
    probe.remove();
  }, [theme]);
  return colors;
}
