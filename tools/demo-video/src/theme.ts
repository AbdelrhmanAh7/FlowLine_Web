// Palette for the `Demo` composition, derived from the design tokens passed in as props (never hard-coded brand hex).
// Pure functions, no React: the CLI resolves src/design/tokens.json and hands the raw values in via `props.tokens`.
import type { Locale, Shape, Theme, ThemeTokens } from "./props.ts";

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

const toHex = (c: Rgb) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

/** mix(a, b, t): a at t = 0, b at t = 1 (sRGB, like CSS color-mix). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const WHITE = "#ffffff";
const BLACK = "#000000";

export type Palette = {
  theme: Theme;
  base: string;
  blobA: string;
  blobB: string;
  hairline: string;
  shadow: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  textMuted: string;
  ripple: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  scrim: string;
  cursorFill: string;
  cursorStroke: string;
  /** Flat fill behind full-bleed shapes. */
  surface: string;
};

export function buildPalette(tokens: ThemeTokens, theme: Theme): Palette {
  const { brand, sky, neutral } = tokens;
  const dark = theme === "dark";
  const base = dark ? tokens.bg : mix(brand["500"], WHITE, 0.93);
  const pillText = dark ? neutral["50"] : tokens.textHi;
  return {
    theme,
    base,
    blobA: dark ? mix(brand["700"], BLACK, 0.5) : mix(brand["400"], WHITE, 0.8),
    blobB: dark ? mix(sky["800"], BLACK, 0.45) : mix(sky["300"], WHITE, 0.7),
    hairline: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(20, 20, 40, 0.07)",
    shadow: dark
      ? "0 50px 120px -30px rgba(0, 0, 0, 0.7), 0 18px 40px -18px rgba(0, 0, 0, 0.55)"
      : "0 50px 120px -30px rgba(40, 30, 110, 0.38), 0 18px 40px -18px rgba(40, 30, 110, 0.25)",
    pillBg: dark ? "rgba(16, 16, 24, 0.72)" : alpha(neutral["50"], 0.82),
    pillBorder: dark ? "rgba(255, 255, 255, 0.10)" : "rgba(20, 20, 40, 0.07)",
    pillText,
    textMuted: alpha(pillText, 0.62),
    ripple: alpha(brand["500"], 0.85),
    accent: tokens.accent,
    accentBg: alpha(tokens.accent, dark ? 0.18 : 0.12),
    accentBorder: alpha(tokens.accent, 0.6),
    scrim: dark ? "rgba(0, 0, 0, 0.42)" : alpha(base, 0.55),
    cursorFill: WHITE,
    cursorStroke: dark ? "#0b0b10" : "#1a1a24",
    surface: tokens.surface,
  };
}

/** Background for the `window` shape: a flat base with two static radial blobs (top-start / bottom-end; mirrored for RTL). */
export function backgroundCss(p: Palette, locale: Locale): string {
  const rtl = locale === "ar";
  const a = rtl ? "100% 0%" : "0% 0%";
  const b = rtl ? "0% 100%" : "100% 100%";
  return [
    `radial-gradient(ellipse 62% 78% at ${a}, ${p.blobA} 0%, transparent 72%)`,
    `radial-gradient(ellipse 62% 78% at ${b}, ${p.blobB} 0%, transparent 72%)`,
    p.base,
  ].join(", ");
}

export const backgroundFor = (p: Palette, shape: Shape, locale: Locale) =>
  shape === "window" ? backgroundCss(p, locale) : p.surface;

export const FONT_EN = '"Inter Variable", "Inter", system-ui, sans-serif';
export const FONT_AR = '"IBM Plex Sans Arabic", "Inter Variable", system-ui, sans-serif';
export const fontFor = (locale: Locale) => (locale === "ar" ? FONT_AR : FONT_EN);
