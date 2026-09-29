/**
 * Flowline design tokens — the single, platform-neutral source of truth.
 *
 * Two layers:
 *  1. PRIMITIVES — raw scales (color per hue, radius, type, motion). Components never use these directly.
 *  2. SEMANTIC — meaning-bearing tokens (bg, surface, accent, success, cat-ai, …), defined per theme.
 *     Components and screens use ONLY these (as Tailwind utilities: bg-surface, text-hi, border-line, …).
 *
 * `pnpm tokens` (scripts/build-tokens.ts) generates from this file:
 *  - src/design/tokens.generated.css — the CSS variables imported by src/app/globals.css (Tailwind v4 @theme);
 *  - src/design/tokens.json — W3C DTCG, for future desktop (Tauri/Electron) and mobile (RN + NativeWind) apps,
 *    which map these same token names 1:1. tests/unit/design-tokens.test.ts fails when the outputs are stale.
 *
 * Hue meanings (docs/design-system/README.md has the full rules):
 *  brand/violet = primary accent & AI · sky = info/running & apps · emerald = success & output
 *  amber = warning & triggers · orange = logic · rose = danger
 */

/* ───────── Primitives ───────── */

/** Color scales. Steps used: 50–950 for neutrals, 300–800 for hues (fg 700/600 light, accent 400 dark). */
export const PRIMITIVE_COLORS = {
  neutral: {
    "50": "#fafafa",
    "100": "#f4f4f5",
    "200": "#e4e4e7",
    "300": "#d4d4d8",
    "400": "#a1a1aa",
    /** Between zinc-500 and zinc-400: the lightest step that still passes WCAG AA (4.5:1) on dark surfaces. */
    "450": "#8a8a93",
    "500": "#71717a",
    "600": "#52525b",
    "700": "#3f3f46",
    "800": "#27272a",
    "900": "#18181b",
    "925": "#111113",
    "950": "#09090b",
  },
  /** Brand violet — the Flowline accent (between Tailwind violet-400 and -600). */
  brand: {
    "300": "#a89fff",
    "400": "#8e80ff",
    "500": "#7c6cff",
    "600": "#6a5ae8",
    "700": "#584ad4",
    "800": "#4739b8",
  },
  violet: { "300": "#c4b5fd", "400": "#a78bfa", "500": "#8b5cf6", "600": "#7c3aed", "700": "#6d28d9" },
  sky: { "300": "#7dd3fc", "400": "#38bdf8", "500": "#0ea5e9", "600": "#0284c7", "700": "#0369a1" },
  emerald: { "300": "#6ee7b7", "400": "#34d399", "500": "#10b981", "600": "#059669", "700": "#047857" },
  amber: { "300": "#fcd34d", "400": "#fbbf24", "500": "#f59e0b", "600": "#d97706", "700": "#b45309" },
  rose: { "300": "#fda4af", "400": "#fb7185", "500": "#f43f5e", "600": "#e11d48", "700": "#be123c" },
  orange: { "300": "#fdba74", "400": "#fb923c", "500": "#f97316", "600": "#ea580c", "700": "#c2410c" },
} as const;

export type PrimitiveScale = keyof typeof PRIMITIVE_COLORS;
/** Reference into PRIMITIVE_COLORS, e.g. "neutral.950". */
export type PrimitiveRef = `${PrimitiveScale}.${string}`;

export const RADIUS = { sm: "4px", md: "6px", lg: "8px", xl: "12px" } as const;

/** [font-size, line-height, letter-spacing?] — Inter scale from the design deck (slide 4). */
export const TEXT = {
  xs: ["11px", "16px", "0.4px"],
  sm: ["12px", "18px"],
  base: ["13px", "20px"],
  lg: ["16px", "24px"],
  xl: ["20px", "28px"],
  "2xl": ["26px", "32px"],
} as const;

/** Motion as data (ms + cubic-bezier) so other platforms map it 1:1. UI transitions never exceed 300 ms. */
export const MOTION = {
  duration: { fast: 80, base: 150, tab: 200, slow: 250, max: 300 },
  easing: {
    standard: [0.4, 0, 0.2, 1],
    emphasized: [0.16, 1, 0.3, 1],
    exit: [0.4, 0, 1, 1],
  },
} as const;

/* ───────── Semantic tokens ───────── */

export interface SemanticTheme {
  /* surfaces */
  bg: PrimitiveRef;
  surface: PrimitiveRef;
  card: PrimitiveRef;
  elevated: PrimitiveRef;
  line: PrimitiveRef;
  "line-strong": PrimitiveRef;
  /* text */
  "text-hi": PrimitiveRef;
  "text-med": PrimitiveRef;
  "text-muted": PrimitiveRef;
  /* accent */
  accent: PrimitiveRef;
  "accent-hover": PrimitiveRef;
  "accent-press": PrimitiveRef;
  "on-accent": PrimitiveRef;
  /* status (foreground; -bg/-border tints are derived in CSS via color-mix) */
  success: PrimitiveRef;
  warning: PrimitiveRef;
  danger: PrimitiveRef;
  info: PrimitiveRef;
  /* node category hues */
  "cat-trigger": PrimitiveRef;
  "cat-logic": PrimitiveRef;
  "cat-ai": PrimitiveRef;
  "cat-app": PrimitiveRef;
  "cat-output": PrimitiveRef;
  /* React Flow canvas (read from JS for MiniMap/Background props) */
  "canvas-dot": PrimitiveRef;
  "minimap-node": PrimitiveRef;
  "minimap-stroke": PrimitiveRef;
  "minimap-mask": string;
  /* overlays */
  scrim: string;
  /* shadows */
  "shadow-popover": string;
  "shadow-glow": string;
}

export type ThemeName = "dark" | "light";

export const SEMANTIC: Record<ThemeName, SemanticTheme> = {
  dark: {
    bg: "neutral.950",
    surface: "neutral.925",
    card: "neutral.900",
    elevated: "neutral.800",
    line: "neutral.800",
    "line-strong": "neutral.700",
    "text-hi": "neutral.50",
    "text-med": "neutral.400",
    "text-muted": "neutral.450",
    accent: "brand.500",
    "accent-hover": "brand.400",
    "accent-press": "brand.600",
    "on-accent": "neutral.950",
    success: "emerald.400",
    warning: "amber.400",
    danger: "rose.400",
    info: "sky.400",
    "cat-trigger": "amber.400",
    "cat-logic": "orange.400",
    "cat-ai": "violet.400",
    "cat-app": "sky.400",
    "cat-output": "emerald.400",
    "canvas-dot": "neutral.800",
    "minimap-node": "neutral.800",
    "minimap-stroke": "neutral.700",
    "minimap-mask": "rgb(9 9 11 / 0.7)",
    scrim: "rgb(0 0 0 / 0.6)",
    "shadow-popover": "0 4px 16px rgb(0 0 0 / 0.45)",
    "shadow-glow": "0 0 0 1px var(--accent), 0 0 18px color-mix(in oklab, var(--accent) 35%, transparent)",
  },
  light: {
    bg: "neutral.100",
    surface: "neutral.50",
    card: "neutral.50",
    elevated: "neutral.50",
    line: "neutral.200",
    "line-strong": "neutral.300",
    "text-hi": "neutral.900",
    "text-med": "neutral.600",
    "text-muted": "neutral.500",
    accent: "brand.600",
    "accent-hover": "brand.700",
    "accent-press": "brand.800",
    "on-accent": "neutral.50",
    success: "emerald.700",
    warning: "amber.700",
    danger: "rose.600",
    info: "sky.700",
    "cat-trigger": "amber.700",
    "cat-logic": "orange.700",
    "cat-ai": "violet.700",
    "cat-app": "sky.700",
    "cat-output": "emerald.700",
    "canvas-dot": "neutral.300",
    "minimap-node": "neutral.200",
    "minimap-stroke": "neutral.300",
    "minimap-mask": "rgb(244 244 245 / 0.7)",
    scrim: "rgb(24 24 27 / 0.4)",
    "shadow-popover": "0 4px 16px rgb(24 24 27 / 0.14)",
    "shadow-glow": "0 0 0 1px var(--accent), 0 0 14px color-mix(in oklab, var(--accent) 28%, transparent)",
  },
};

/** Status & category tints derived from the base hue — identical mix in both themes. */
export const TINTS = { bg: 12, border: 45 } as const;

export function primitiveHex(ref: PrimitiveRef): string {
  const [scale, step] = ref.split(".") as [PrimitiveScale, string];
  const scaleObj = PRIMITIVE_COLORS[scale] as Record<string, string>;
  const hex = scaleObj[step];
  if (!hex) throw new Error(`Unknown primitive color reference: ${ref}`);
  return hex;
}
