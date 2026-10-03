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
 *    which map these same token names 1:1. tests/unit/design-system.test.ts fails when the outputs are stale.
 *
 * Hue meanings (docs/design-system/README.md has the full rules):
 *  brand/violet = primary accent & AI · sky = info/running & apps · emerald = success & output
 *  amber = warning & triggers · orange = logic · rose = danger
 */

/* ───────── Primitives ───────── */

/**
 * Color scales. Steps used: 50–950 for neutrals, 300–800 for hues. Light-theme foregrounds that sit on their own
 * 12% tint (badges, chips) use 700–800 (the lightest step that still passes AA 4.5:1 on the tinted background);
 * dark-theme foregrounds use 400 (accent text: 350). The accent FILL is the deck's brand colour in both themes
 * (dark brand-500 `#7C6CFF`, light brand-600); accent TEXT is a separate token (`accent-text`).
 */
export const PRIMITIVE_COLORS = {
  neutral: {
    "50": "#fafafa",
    "100": "#f4f4f5",
    "200": "#e4e4e7",
    "300": "#d4d4d8",
    "400": "#a1a1aa",
    /** Between zinc-500 and zinc-400: the lightest step that still passes WCAG AA (4.5:1) on dark surfaces. */
    "450": "#94949c",
    /**
     * Between neutral-450 and -500: the form-control boundary (`line-control`), chosen so it is >= 3:1 (WCAG 1.4.11) against
     * EVERY surface in BOTH themes: dark 3.60 (elevated) .. 4.81 (bg), light 3.76 (bg) .. 3.96 (card/surface/elevated).
     */
    "475": "#7c7c85",
    "500": "#71717a",
    /** Between zinc-600 and zinc-500: the lightest step that passes AA on the light app background. */
    "550": "#6d6d76",
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
    /** Between brand-300 and -400: the dark-theme `accent-text` — the step that keeps accent-coloured text ≥4.5:1 on its own tint over every dark surface (incl. popovers). */
    "350": "#9d92ff",
    "400": "#8e80ff",
    /** The deck's brand fill (`#7C6CFF`): the dark-theme `accent`. */
    "500": "#7c6cff",
    /** Between brand-500 and -600: the dark-theme pressed fill — the darkest step that keeps `on-accent` (near-black) ≥4.5:1 (brand-600 itself gives only 4.0:1 there). */
    "550": "#7566f7",
    /** The light-theme `accent` fill. */
    "600": "#6a5ae8",
    "700": "#584ad4",
    "800": "#4739b8",
  },
  violet: { "300": "#c4b5fd", "400": "#a78bfa", "500": "#8b5cf6", "600": "#7c3aed", "700": "#6d28d9", "800": "#5b21b6" },
  sky: { "300": "#7dd3fc", "400": "#38bdf8", "500": "#0ea5e9", "600": "#0284c7", "700": "#0369a1", "800": "#075985" },
  emerald: { "300": "#6ee7b7", "400": "#34d399", "500": "#10b981", "600": "#059669", "700": "#047857", "800": "#065f46" },
  amber: { "300": "#fcd34d", "400": "#fbbf24", "500": "#f59e0b", "600": "#d97706", "700": "#b45309", "800": "#92400e" },
  rose: { "300": "#fda4af", "400": "#fb7185", "500": "#f43f5e", "600": "#e11d48", "700": "#be123c", "800": "#9f1239" },
  orange: { "300": "#fdba74", "400": "#fb923c", "500": "#f97316", "600": "#ea580c", "700": "#c2410c", "800": "#7c2d12" },
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
  /**
   * The boundary of a form control (input, textarea, select): WCAG 1.4.11 asks 3:1 for the edge that identifies a control, and
   * `line`/`line-strong` are deliberately quiet dividers (~1.3-1.6:1). tests/unit/design-system.test.ts asserts >= 3:1 on every surface.
   */
  "line-control": PrimitiveRef;
  /* text */
  "text-hi": PrimitiveRef;
  "text-med": PrimitiveRef;
  "text-muted": PrimitiveRef;
  /* accent: the FILL (buttons, focus rings, graphics — the deck's brand colour) and accent-coloured TEXT (links, badges, chips) */
  accent: PrimitiveRef;
  "accent-hover": PrimitiveRef;
  "accent-press": PrimitiveRef;
  /** Text/icon colour on the `accent*` fills. */
  "on-accent": PrimitiveRef;
  /** Accent-coloured text and glyphs (links, accent Badge/StatusBadge, active nav icon): AA 4.5:1 on every surface and on the accent tint. Never a fill. */
  "accent-text": PrimitiveRef;
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
  /* decorative glows (landing page gradient layers; never behind essential text at full strength) */
  "glow-accent": PrimitiveRef;
  "glow-info": PrimitiveRef;
  "glow-success": PrimitiveRef;
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
    "line-control": "neutral.475",
    "text-hi": "neutral.50",
    "text-med": "neutral.400",
    "text-muted": "neutral.450",
    accent: "brand.500",
    "accent-hover": "brand.400",
    "accent-press": "brand.550",
    "on-accent": "neutral.950",
    "accent-text": "brand.350",
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
    "glow-accent": "brand.500",
    "glow-info": "sky.500",
    "glow-success": "emerald.500",
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
    "line-control": "neutral.475",
    "text-hi": "neutral.900",
    "text-med": "neutral.600",
    "text-muted": "neutral.550",
    accent: "brand.600",
    "accent-hover": "brand.700",
    "accent-press": "brand.800",
    "on-accent": "neutral.50",
    "accent-text": "brand.700",
    success: "emerald.800",
    warning: "amber.800",
    danger: "rose.700",
    info: "sky.700",
    "cat-trigger": "amber.800",
    "cat-logic": "orange.800",
    "cat-ai": "violet.700",
    "cat-app": "sky.700",
    "cat-output": "emerald.800",
    "canvas-dot": "neutral.300",
    "minimap-node": "neutral.200",
    "minimap-stroke": "neutral.300",
    "minimap-mask": "rgb(244 244 245 / 0.7)",
    "glow-accent": "brand.500",
    "glow-info": "sky.500",
    "glow-success": "emerald.500",
    scrim: "rgb(24 24 27 / 0.4)",
    "shadow-popover": "0 4px 16px rgb(24 24 27 / 0.14)",
    "shadow-glow": "0 0 0 1px var(--accent), 0 0 14px color-mix(in oklab, var(--accent) 28%, transparent)",
  },
};

/**
 * Status & category tints derived from the base hue — identical mix in both themes. The `bg` tint is what badges and chips
 * put their hue text on, so tests/unit/design-system.test.ts composites it over every surface and asserts AA 4.5:1 for each
 * semantic foreground (change these numbers or a foreground token and that test tells you which pair broke).
 */
export const TINTS = { bg: 12, border: 45 } as const;

export function primitiveHex(ref: PrimitiveRef): string {
  const [scale, step] = ref.split(".") as [PrimitiveScale, string];
  const scaleObj = PRIMITIVE_COLORS[scale] as Record<string, string>;
  const hex = scaleObj[step];
  if (!hex) throw new Error(`Unknown primitive color reference: ${ref}`);
  return hex;
}
