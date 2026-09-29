/**
 * Generators for the two token outputs (see src/design/tokens.ts). Pure string builders so
 * scripts/build-tokens.ts can write them and tests/unit/design-tokens.test.ts can diff them.
 */
import { MOTION, PRIMITIVE_COLORS, RADIUS, SEMANTIC, TEXT, TINTS, type PrimitiveRef, type SemanticTheme, type ThemeName } from "./tokens";

const HEADER = "/* GENERATED from src/design/tokens.ts by `pnpm tokens` — do not edit by hand. */\n";

/** Semantic token name → Tailwind color utility name (bg-app, text-hi, border-line-strong, …). */
const UTILITY_NAME: Record<string, string> = {
  bg: "app",
  "text-hi": "hi",
  "text-med": "med",
  "text-muted": "muted",
};

/** Semantic color tokens (everything in SemanticTheme except shadows). */
function semanticColorKeys(theme: SemanticTheme): string[] {
  return Object.keys(theme).filter((k) => !k.startsWith("shadow-"));
}

/** Tokens that get derived -bg / -border tint utilities. */
const TINTED = ["accent", "success", "warning", "danger", "info", "cat-trigger", "cat-logic", "cat-ai", "cat-app", "cat-output"] as const;

/** Semantic tokens whose value is a raw string, not a primitive reference. */
const RAW_VALUE = new Set(["minimap-mask", "scrim"]);

function themeVars(name: ThemeName, indent: string): string {
  const t = SEMANTIC[name];
  const lines = semanticColorKeys(t).map((k) => {
    const v = t[k as keyof SemanticTheme] as string;
    const resolved = RAW_VALUE.has(k) ? v : `var(--color-${(v as PrimitiveRef).replace(".", "-")})`;
    return `${indent}--${k}: ${resolved};`;
  });
  lines.push(`${indent}--shadow-popover: ${t["shadow-popover"]};`);
  lines.push(`${indent}--shadow-glow: ${t["shadow-glow"]};`);
  lines.push(`${indent}--gradient-brand: linear-gradient(135deg, var(--${name === "dark" ? "accent" : "accent"}), var(--color-sky-${name === "dark" ? "400" : "600"}));`);
  lines.push(`${indent}color-scheme: ${name};`);
  return lines.join("\n");
}

export function generateCss(): string {
  const out: string[] = [HEADER];

  /* ── @theme: primitives (scales, radius, type, motion) ── */
  out.push("@theme {");
  for (const [scale, steps] of Object.entries(PRIMITIVE_COLORS)) {
    for (const [step, hex] of Object.entries(steps)) out.push(`  --color-${scale}-${step}: ${hex};`);
  }
  for (const [k, v] of Object.entries(RADIUS)) out.push(`  --radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(TEXT)) {
    out.push(`  --text-${k}: ${v[0]};`);
    out.push(`  --text-${k}--line-height: ${v[1]};`);
    if (v[2]) out.push(`  --text-${k}--letter-spacing: ${v[2]};`);
  }
  for (const [k, v] of Object.entries(MOTION.duration)) out.push(`  --dur-${k}: ${v}ms;`);
  for (const [k, v] of Object.entries(MOTION.easing)) out.push(`  --ease-${k}: cubic-bezier(${v.join(", ")});`);
  out.push("}");

  /* ── @theme inline: semantic aliases → utilities resolve per theme ── */
  out.push("@theme inline {");
  for (const k of semanticColorKeys(SEMANTIC.dark)) out.push(`  --color-${UTILITY_NAME[k] ?? k}: var(--${k});`);
  for (const k of TINTED) {
    out.push(`  --color-${k}-bg: var(--${k}-bg);`);
    out.push(`  --color-${k}-border: var(--${k}-border);`);
  }
  out.push("}");

  /* ── Semantic values per theme (:root = dark, the default) ── */
  out.push(":root {");
  out.push(themeVars("dark", "  "));
  for (const k of TINTED) {
    out.push(`  --${k}-bg: color-mix(in oklab, var(--${k}) ${TINTS.bg}%, transparent);`);
    out.push(`  --${k}-border: color-mix(in oklab, var(--${k}) ${TINTS.border}%, transparent);`);
  }
  out.push("}");
  out.push('[data-theme="light"] {');
  out.push(themeVars("light", "  "));
  out.push("}");
  out.push("@media (prefers-color-scheme: light) {");
  out.push('  [data-theme="system"] {');
  out.push(themeVars("light", "    "));
  out.push("  }");
  out.push("}");

  return out.join("\n") + "\n";
}

/** W3C DTCG-shaped JSON: primitives inline, semantic tokens as {references} per theme. */
export function generateDtcg(): string {
  const color: Record<string, Record<string, unknown>> = {};
  for (const [scale, steps] of Object.entries(PRIMITIVE_COLORS)) {
    color[scale] = Object.fromEntries(Object.entries(steps).map(([step, hex]) => [step, { $type: "color", $value: hex }]));
  }
  const theme = Object.fromEntries(
    (Object.keys(SEMANTIC) as ThemeName[]).map((name) => {
      const t = SEMANTIC[name];
      const entries = Object.entries(t).map(([k, v]) => {
        const isRef = !k.startsWith("shadow-") && !RAW_VALUE.has(k);
        return [k, { $type: "color", $value: isRef ? `{color.${v}}` : v }];
      });
      return [name, Object.fromEntries(entries)];
    }),
  );
  const doc = {
    $description: "Flowline design tokens — generated from src/design/tokens.ts (do not edit). Primitives are inline; semantic tokens reference them per theme.",
    color,
    semantic: theme,
    radius: Object.fromEntries(Object.entries(RADIUS).map(([k, v]) => [k, { $type: "dimension", $value: v }])),
    typography: Object.fromEntries(
      Object.entries(TEXT).map(([k, v]) => [
        k,
        { $type: "typography", $value: { fontSize: v[0], lineHeight: v[1], ...(v[2] ? { letterSpacing: v[2] } : {}) } },
      ]),
    ),
    motion: {
      duration: Object.fromEntries(Object.entries(MOTION.duration).map(([k, v]) => [k, { $type: "duration", $value: `${v}ms` }])),
      easing: Object.fromEntries(Object.entries(MOTION.easing).map(([k, v]) => [k, { $type: "cubicBezier", $value: v }])),
    },
    tintMix: { $description: "Derived -bg/-border tints: color-mix(in oklab, <base> N%, transparent)", bg: TINTS.bg, border: TINTS.border },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
