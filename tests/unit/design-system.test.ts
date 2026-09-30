import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { STAGGER_TOTAL_MS, wordDelayMs, wordRuns } from "@/components/landing/reveal";
import { blend, contrastRatio, type ContrastSpec } from "@/design/contrast";
import { generateCss, generateDtcg, TINT_TEXT, TINTED } from "@/design/generate";
import { MOTION, primitiveHex, SEMANTIC, TINTS, type SemanticTheme, type ThemeName } from "@/design/tokens";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";
import { DEFAULT_THEME, resolveTheme, THEME_COOKIE, THEME_PREFERENCES } from "@/theme/config";

/* ───────── Generated files are up to date with src/design/tokens.ts ───────── */

describe("design tokens", () => {
  it("tokens.generated.css and tokens.json are fresh (run `pnpm tokens` after editing tokens.ts)", () => {
    expect(readFileSync("src/design/tokens.generated.css", "utf8")).toBe(generateCss());
    expect(readFileSync("src/design/tokens.json", "utf8")).toBe(generateDtcg());
  });

  it("every theme block declares the -bg/-border tints itself, so a nested [data-theme] panel gets its OWN tints", () => {
    // A custom property that reads var(--accent) is resolved where it is declared: tints on :root alone would freeze the root theme's
    // tint and a nested panel (the /design-system guide) would inherit it. Each block must carry base tokens AND derived tints.
    const css = generateCss();
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
    const declares = (body: string, prop: string) => new RegExp(String.raw`(?:^|[\s;])--${prop}:`).test(body);
    const themeBlocks = blocks.filter((b) => declares(b.body, "bg") && declares(b.body, "accent"));
    expect(themeBlocks.map((b) => b.selector)).toEqual([':root, [data-theme="dark"], [data-theme="system"]', '[data-theme="light"]', '[data-theme="system"]']);
    for (const b of themeBlocks) {
      for (const k of TINTED) {
        expect(b.body, `${b.selector} must declare --${k}-bg`).toContain(`--${k}-bg: color-mix(in oklab, var(--${k}) ${TINTS.bg}%, transparent);`);
        expect(b.body, `${b.selector} must declare --${k}-border`).toContain(`--${k}-border: color-mix(in oklab, var(--${k}) ${TINTS.border}%, transparent);`);
      }
    }
    // ...and nothing else declares a tint (the @theme inline aliases only reference them).
    expect(blocks.filter((b) => declares(b.body, "accent-bg"))).toHaveLength(themeBlocks.length);
    // An explicit selector for every theme name: a nested dark panel inside a light page needs [data-theme="dark"], not just :root.
    const selectors = themeBlocks.map((b) => b.selector).join(" | ");
    for (const name of ["dark", "light", "system"]) expect(selectors).toContain(`[data-theme="${name}"]`);
  });
});

/* ───────── Guard: components and screens use semantic tokens only ─────────
 * Everything under src/app/** and src/components/** (ts, tsx, js, jsx AND css, including src/app/globals.css and the
 * /design-system style guide) must reference colour through semantic tokens: bg-surface, text-hi, border-line, var(--accent)…
 * The token/theme SOURCE files (src/design/**: tokens.ts, tokens.generated.css, tokens.json; src/theme/**) are the only
 * places raw values and primitives may live, and they sit outside the scan roots by construction (checked below).
 */

const SCAN_ROOTS = ["src/app", "src/components"];
const TOKEN_SOURCES = ["src/design", "src/theme"];
const SCANNED_FILE = /\.(ts|tsx|js|jsx|css)$/;

/** Every Tailwind default-palette family plus our own primitive scales (neutral, brand, violet, …). */
const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|brand";
/** Utility prefixes that take a colour (bg-*, text-*, border-t-*, ring-offset-*, from-*, …). */
const UTILITY = "bg|text|border|border-[xyseltrb]|divide|outline|ring|ring-offset|shadow|inset-shadow|drop-shadow|text-shadow|fill|stroke|from|via|to|accent|caret|decoration|placeholder|scrollbar|selection";

/** #fff, #ffffff, #ffffff80 … */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
/** rgb()/rgba()/hsl()/hsla()/hwb()/oklab()/oklch()/lab()/lch(), also inside Tailwind arbitrary values (`rgb(0_0_0/0.4)`); `color-mix(in oklab, …)` is fine (no paren after the space name). */
const COLOR_FN = /(?<![A-Za-z])(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch)\(/;
/** bg-sky-500, text-neutral-900, hover:border-red-400/50, from-brand-500 — any palette family + shade. */
const PALETTE_CLASS = new RegExp(String.raw`(?<![\w-])(?:${UTILITY})-(?:${PALETTE})-\d{2,3}(?!\d)`);
/** bg-black/60, text-white, border-white/10 (Tailwind's colour keywords: they bypass the theme). */
const KEYWORD_CLASS = new RegExp(String.raw`(?<![\w-])(?:${UTILITY})-(?:white|black)(?![\w-])`);
/** text-accent (and text-accent-hover/-press/-bg/-border): `accent` is the brand FILL and is not AA as text; accent-coloured text is `text-accent-text`. */
const ACCENT_FILL_AS_TEXT = /(?<![\w-])text-accent(?:-hover|-press|-bg|-border)?(?![\w-])/;
/** var(--color-brand-500), bg-(--color-sky-400), [--x:var(--color-neutral-800)] — primitive scale variables. */
const PRIMITIVE_VAR = new RegExp(String.raw`--color-(?:${PALETTE})-\d{2,3}(?!\d)`);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== "node_modules") yield* walk(p);
    } else if (SCANNED_FILE.test(entry)) {
      yield p;
    }
  }
}

/** "path:line: <trimmed source line>" for every line that matches, so a failure names exactly what to fix. */
function offenders(files: string[], re: RegExp): string[] {
  const out: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (re.test(line)) out.push(`${relative(".", f).replaceAll("\\", "/")}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
  }
  return out;
}

describe("token guard", () => {
  const files = SCAN_ROOTS.flatMap((root) => [...walk(root)]);

  it("scans a non-trivial set of files (incl. globals.css, excluding the token sources)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.replaceAll("\\", "/") === "src/app/globals.css")).toBe(true);
    for (const root of SCAN_ROOTS) for (const src of TOKEN_SOURCES) expect(root.startsWith(src)).toBe(false);
  });

  it("the guard patterns catch the known-bad shapes and leave semantic tokens alone", () => {
    const bad: Array<[RegExp, string]> = [
      [HEX, 'style={{ color: "#fff" }}'],
      [HEX, "fill: #7c6cff80;"],
      [COLOR_FN, "shadow-[0_0_8px_rgb(0_0_0/0.4)]"],
      [COLOR_FN, "background: hsl(220 10% 50%)"],
      [COLOR_FN, "color: oklch(0.7 0.1 250)"],
      [PALETTE_CLASS, 'className="bg-sky-500"'],
      [PALETTE_CLASS, 'className="hover:text-red-400/70"'],
      [PALETTE_CLASS, 'className="border-t-neutral-800"'],
      [PALETTE_CLASS, 'className="from-brand-500 to-violet-600"'],
      [KEYWORD_CLASS, 'className="absolute inset-0 bg-black/60"'],
      [KEYWORD_CLASS, 'className="text-white"'],
      [KEYWORD_CLASS, 'className="focus:ring-white/20"'],
      [PRIMITIVE_VAR, 'background: "radial-gradient(closest-side, var(--color-brand-500), transparent)"'],
      [PRIMITIVE_VAR, 'className="bg-(--color-sky-400)"'],
      [ACCENT_FILL_AS_TEXT, 'className="text-accent hover:underline"'],
      [ACCENT_FILL_AS_TEXT, 'className={active && "text-accent"}'],
      [ACCENT_FILL_AS_TEXT, 'className="hover:text-accent-hover"'],
    ];
    for (const [re, sample] of bad) expect(re.test(sample), `should flag: ${sample}`).toBe(true);
    const ok = [
      'className="bg-surface text-hi border-line-strong text-on-accent bg-scrim bg-cat-ai-bg text-med"',
      'className="bg-brand whitespace-nowrap bg-accent-bg border-accent-border"',
      "background: color-mix(in oklab, var(--accent) 12%, transparent);",
      "bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)]",
      'style={{ background: "radial-gradient(closest-side, var(--glow-accent), transparent)" }}',
      'href="#product" aria-label="#12"',
      'className="rounded-lg border border-dashed border-accent shadow-[var(--shadow-glow)]"',
      'className="bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press text-accent-text"',
    ];
    for (const sample of ok) {
      for (const re of [HEX, COLOR_FN, PALETTE_CLASS, KEYWORD_CLASS, PRIMITIVE_VAR, ACCENT_FILL_AS_TEXT]) expect(re.test(sample), `should not flag: ${sample}`).toBe(false);
    }
  });

  it("no raw hex colors in components or screens", () => {
    expect(offenders(files, HEX)).toEqual([]);
  });
  it("no rgb()/hsl()/oklch()/… colors in components or screens", () => {
    expect(offenders(files, COLOR_FN)).toEqual([]);
  });
  it("no Tailwind default-palette or primitive-scale classes (bg-sky-500, text-neutral-900, …)", () => {
    expect(offenders(files, PALETTE_CLASS)).toEqual([]);
  });
  it("no Tailwind colour keywords that bypass the theme (bg-black/60, text-white, …): use bg-scrim, text-on-accent, semantic text", () => {
    expect(offenders(files, KEYWORD_CLASS)).toEqual([]);
  });
  it("no primitive-scale variables (var(--color-brand-500), …): use semantic variables (var(--accent), var(--glow-accent), …)", () => {
    expect(offenders(files, PRIMITIVE_VAR)).toEqual([]);
  });
  it("accent-coloured text uses text-accent-text, not the accent fill (text-accent)", () => {
    expect(offenders(files, ACCENT_FILL_AS_TEXT)).toEqual([]);
  });
});

/* ───────── Theme cookie resolution ───────── */

describe("fl_theme resolution", () => {
  it("falls back to dark when the cookie is absent or unknown", () => {
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
    expect(resolveTheme("")).toBe(DEFAULT_THEME);
    expect(resolveTheme("purple")).toBe(DEFAULT_THEME);
    expect(resolveTheme("DARK")).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe("dark");
  });
  it("accepts exactly the three preferences", () => {
    for (const p of THEME_PREFERENCES) expect(resolveTheme(p)).toBe(p);
    expect(THEME_PREFERENCES).toEqual(["light", "dark", "system"]);
  });
  it("uses the fl_theme cookie name", () => {
    expect(THEME_COOKIE).toBe("fl_theme");
  });
});

/* ───────── WCAG AA contrast, both themes ─────────
 * Every foreground/background pair the UI actually renders, computed from src/design/tokens.ts (nothing hard-coded):
 *  - body/muted text on every surface (bg, surface, card, elevated);
 *  - on-accent text on the accent fill and its hover/press states (primary buttons);
 *  - hue text on its plain surface (status text, dots' labels) and accent-text (links, accent badges) on every surface —
 *    the accent FILL is the deck's brand colour (dark #7C6CFF), so accent-coloured text is a separate token;
 *  - hue text on ITS OWN -bg tint, composited over every surface (Badge, StatusBadge chip, CategoryChip) — the tint is
 *    `color-mix(in oklab, <hue> TINTS.bg%, transparent)` = the hue at that alpha, so it is measured as blend(hue, surface, alpha);
 *    for the accent tint the text is accent-text over the tint of the accent fill (TINT_TEXT);
 *  - category hues and the accent fill as graphics (icons, dots, focus rings, borders) at 3:1;
 *  - the form-control boundary (`line-control`, the border of input/textarea/select) at 3:1 (WCAG 1.4.11 non-text contrast) on
 *    EVERY surface in both themes: controls fill with `bg` and sit on any of the four, so all four are the adjacent colours.
 *    `line`/`line-strong` stay quiet dividers (they are not measured: they identify nothing on their own).
 */

const hex = (theme: ThemeName, key: keyof SemanticTheme) => primitiveHex(SEMANTIC[theme][key] as never);

const SURFACES = ["bg", "surface", "card", "elevated"] as const;
const BODY_TEXT = ["text-hi", "text-med", "text-muted"] as const;
const ACCENT_STATES = ["accent", "accent-hover", "accent-press"] as const;
const STATUS_TEXT = ["accent-text", "success", "warning", "danger", "info"] as const;
const CATEGORY_HUES = TINTED.filter((k) => k.startsWith("cat-"));
/** Non-text (graphics) foregrounds: category hues plus the accent fill (focus ring, borders, edges, dots). */
const GRAPHIC_HUES = ["accent", ...CATEGORY_HUES] as const;
/** The text token that sits on a tinted token's -bg tint (the token itself, unless TINT_TEXT names a separate one). */
const tintText = (k: (typeof TINTED)[number]): keyof SemanticTheme => TINT_TEXT[k] ?? k;

function contrastPairs(theme: ThemeName): ContrastSpec[] {
  const pairs: ContrastSpec[] = [];
  for (const fg of BODY_TEXT) {
    for (const bg of SURFACES) pairs.push({ label: `${fg} on ${bg}`, fg: hex(theme, fg), bg: hex(theme, bg), min: 4.5 });
  }
  for (const bg of ACCENT_STATES) pairs.push({ label: `on-accent on ${bg}`, fg: hex(theme, "on-accent"), bg: hex(theme, bg), min: 4.5 });
  for (const fg of STATUS_TEXT) {
    for (const bg of SURFACES) pairs.push({ label: `${fg} text on ${bg}`, fg: hex(theme, fg), bg: hex(theme, bg), min: 4.5 });
  }
  for (const hue of TINTED) {
    const fg = tintText(hue);
    for (const surface of SURFACES) {
      pairs.push({
        label: `${fg} on its ${TINTS.bg}% tint over ${surface}`,
        fg: hex(theme, fg),
        bg: blend(hex(theme, hue), hex(theme, surface), TINTS.bg / 100),
        min: 4.5,
      });
    }
  }
  for (const fg of GRAPHIC_HUES) {
    for (const bg of SURFACES) pairs.push({ label: `${fg} graphic on ${bg}`, fg: hex(theme, fg), bg: hex(theme, bg), min: 3 });
  }
  for (const bg of SURFACES) pairs.push({ label: `line-control boundary on ${bg}`, fg: hex(theme, "line-control"), bg: hex(theme, bg), min: 3 });
  return pairs;
}

describe("contrast (WCAG AA)", () => {
  it("blend composites a foreground at an alpha over an opaque background", () => {
    expect(blend("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(blend("#000000", "#ffffff", 1)).toBe("#000000");
    expect(blend("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });

  it("every tinted token is covered (the pair list is derived from the token source, not a copy of it)", () => {
    expect(TINTED.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TINTED).size).toBe(TINTED.length);
    for (const theme of ["dark", "light"] as const) {
      const labels = contrastPairs(theme).map((p) => p.label);
      for (const k of TINTED) for (const s of SURFACES) expect(labels).toContain(`${tintText(k)} on its ${TINTS.bg}% tint over ${s}`);
      for (const s of SURFACES) {
        expect(labels).toContain(`accent-text text on ${s}`);
        expect(labels).toContain(`accent graphic on ${s}`);
        expect(labels).toContain(`line-control boundary on ${s}`);
      }
      for (const state of ACCENT_STATES) expect(labels).toContain(`on-accent on ${state}`);
      expect(labels.length).toBeGreaterThan(90);
    }
  });

  it("keeps the deck's brand fill: dark accent is the design-reference accent, light accent is brand-600", () => {
    const deck = /accent\s*·\s*#([0-9a-f]{6})/i.exec(readFileSync("design-reference/DESIGN-REFERENCE.md", "utf8"));
    expect(deck, "design-reference/DESIGN-REFERENCE.md must list the accent hex").not.toBeNull();
    expect(hex("dark", "accent").toLowerCase()).toBe(`#${deck![1]!.toLowerCase()}`);
    expect(SEMANTIC.light.accent).toBe("brand.600");
  });

  for (const theme of ["dark", "light"] as const) {
    it(`${theme}: every text pair passes 4.5:1 (graphics 3:1)`, () => {
      const failures = contrastPairs(theme)
        .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
        .filter((p) => p.ratio < p.min)
        .map((p) => `${p.label}: ${p.ratio.toFixed(2)} < ${p.min} (${p.fg} on ${p.bg})`);
      expect(failures).toEqual([]);
    });
  }
});

/* ───────── Public pages under prefers-reduced-motion (static guard) ─────────
 * The browser E2E (e2e/landing.spec.ts, e2e/reduced-motion.spec.ts) proves the rendered behaviour; these checks fail fast,
 * without a browser, if the CSS/markup that makes the public pages static-and-readable is weakened.
 */

/** Every declaration matching `needle`, with its selector and the at-rules (@media/@supports) it sits inside. */
function declarations(css: string, needle: RegExp): Array<{ selector: string; atRules: string[]; text: string }> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack: string[] = [];
  const out: Array<{ selector: string; atRules: string[]; text: string }> = [];
  let buf = "";
  const flush = () => {
    if (needle.test(buf)) out.push({ selector: stack.at(-1) ?? "", atRules: stack.slice(0, -1), text: buf.trim() });
    buf = "";
  };
  for (const ch of source) {
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") {
      flush();
    } else {
      buf += ch;
    }
  }
  return out;
}

describe("public pages: reduced motion is static and readable", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const NO_PREF = /prefers-reduced-motion:\s*no-preference/;

  it("the hero pin (170vh wrapper, sticky stage) and every scroll-timeline animation exist only under no-preference", () => {
    const pins = declarations(css, /^\s*(?:height:\s*170vh|position:\s*sticky)\s*$/).filter((d) => /hero-pin/.test(d.selector));
    expect(pins.length).toBeGreaterThanOrEqual(2);
    for (const d of pins) expect(d.atRules.some((a) => NO_PREF.test(a)), `${d.selector} { ${d.text} } must be inside @media (prefers-reduced-motion: no-preference)`).toBe(true);
    const timelines = declarations(css, /^\s*animation-timeline\s*:/);
    expect(timelines.length).toBeGreaterThanOrEqual(3);
    for (const d of timelines) expect(d.atRules.some((a) => NO_PREF.test(a)), `${d.selector} { ${d.text} }`).toBe(true);
  });

  it("scroll reveals never keep an opacity-0 end state, the magnet is off, and delays are zeroed under reduce", () => {
    const reduce = (d: { atRules: string[] }) => d.atRules.some((a) => /prefers-reduced-motion:\s*reduce/.test(a));
    const reveals = declarations(css, /^\s*opacity:\s*1\s*!important\s*$/).filter((d) => reduce(d) && /data-reveal="hidden"/.test(d.selector));
    expect(reveals.map((d) => d.selector).join(" | ")).toMatch(/\.reveal\[data-reveal="hidden"\]/);
    expect(reveals.map((d) => d.selector).join(" | ")).toMatch(/\.word-reveal\[data-reveal="hidden"\] \.word\b/);
    expect(declarations(css, /^\s*transform:\s*none\s*!important\s*$/).filter((d) => reduce(d) && /\.magnetic/.test(d.selector))).toHaveLength(1);
    expect(declarations(css, /^\s*transition-delay:\s*0s\s*!important\s*$/).filter(reduce).length).toBeGreaterThanOrEqual(1);
  });

  it("landing components only pin (sticky, tall vh heights) under lg:motion-safe:", () => {
    const dir = "src/components/landing";
    const bare = /(?<![\w:-])(?:lg:)(?:sticky|min-h-\[\d+vh\]|h-\[\d+vh\])/;
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(offenders(files.map((f) => join(dir, f)), bare)).toEqual([]);
    // The pin classes are still there (guards against "fixing" this test by deleting the pin markup's motion-safe form).
    const flowScene = readFileSync(join(dir, "flow-scene.tsx"), "utf8");
    expect(flowScene).toContain("lg:motion-safe:h-[220vh]");
    expect(flowScene).toContain("lg:motion-safe:sticky");
    expect(readFileSync(join(dir, "feature-scenes.tsx"), "utf8")).toContain("lg:motion-safe:min-h-[105vh]");
  });

  it("scroll reveals never hide under reduce and never branch markup on the preference", () => {
    const reveal = readFileSync("src/components/landing/reveal.tsx", "utf8");
    expect(reveal).toMatch(/matchMedia\(REDUCED_MOTION\)\.matches\) return/);
    for (const f of ["reveal.tsx", "magnetic.tsx", "scroll-root.tsx", "hero-pin.tsx", "parallax-gradients.tsx", "feature-scenes.tsx"]) {
      expect(readFileSync(join("src/components/landing", f), "utf8"), `${f} must not read useReducedMotion during render (hydration)`).not.toMatch(/useReducedMotion/);
    }
  });

  it("the hero scrub is driven by the wrapper's NAMED view timeline, inside the support + desktop + no-preference gate", () => {
    // .hero-scrub sits inside the sticky stage: its own view() progress stands still while pinned and only advances at pin release.
    const gate = (d: { atRules: string[] }) =>
      d.atRules.some((a) => /@supports\s*\(animation-timeline:\s*view\(\)\)/.test(a)) && d.atRules.some((a) => /min-width:\s*1024px/.test(a) && NO_PREF.test(a));
    const pin = declarations(css, /^\s*view-timeline\s*:/);
    expect(pin.map((d) => d.selector)).toEqual([".hero-pin"]);
    const name = /^view-timeline:\s*(--[\w-]+)\s+block$/.exec(pin[0]!.text.replace(/\s+/g, " "))?.[1];
    expect(name, `.hero-pin { ${pin[0]!.text} } must declare a named block-axis view timeline`).toBeTruthy();

    const scrubTimeline = declarations(css, /^\s*animation-timeline\s*:/).filter((d) => d.selector === ".hero-scrub");
    expect(scrubTimeline).toHaveLength(1);
    expect(scrubTimeline[0]!.text.replace(/\s+/g, " ")).toBe(`animation-timeline: ${name}`);
    const scrubRange = declarations(css, /^\s*animation-range\s*:/).filter((d) => d.selector === ".hero-scrub");
    expect(scrubRange).toHaveLength(1);
    expect(scrubRange[0]!.text.replace(/\s+/g, " ")).toBe("animation-range: contain 0% contain 100%");
    const scrubAnimation = declarations(css, /^\s*animation\s*:\s*m-hero-scrub\b/).filter((d) => d.selector === ".hero-scrub");
    expect(scrubAnimation).toHaveLength(1);

    for (const d of [...pin, ...scrubTimeline, ...scrubRange, ...scrubAnimation]) {
      expect(gate(d), `${d.selector} { ${d.text} } must sit in @supports (animation-timeline: view()) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)`).toBe(true);
    }
    // The wrapper's pin (height, sticky stage) lives in the very same gate as its timeline.
    for (const d of declarations(css, /^\s*(?:height:\s*170vh|position:\s*sticky)\s*$/).filter((x) => /hero-pin/.test(x.selector))) expect(gate(d), `${d.selector} { ${d.text} }`).toBe(true);
    // The old anonymous view() on the scrub element itself must not come back.
    expect(declarations(css, /^\s*animation-timeline\s*:\s*view\(/).filter((d) => d.selector === ".hero-scrub")).toEqual([]);
  });

  it("the selection pulse never replaces the host's own animation (running glow, shake, node-in ...)", () => {
    // `animation` is one property: two classes that each set it replace each other, so the pulse is drawn on ::after instead.
    expect(declarations(css, /^\s*animation\s*:/).filter((d) => d.selector === ".motion-select-pulse")).toEqual([]);
    expect(declarations(css, /^\s*animation\s*:\s*m-select-pulse\b/).filter((d) => d.selector === ".motion-select-pulse::after")).toHaveLength(1);
    // The running glow still owns the host.
    expect(declarations(css, /^\s*animation\s*:\s*m-running\b/).filter((d) => d.selector === ".motion-running")).toHaveLength(1);
    // Static under reduce: the global reset covers pseudo-elements too.
    const reset = declarations(css, /^\s*animation\s*:\s*none\s*!important\s*$/).filter((d) => /prefers-reduced-motion:\s*reduce/.test(d.atRules.join(" ")));
    expect(reset.some((d) => /\*::after/.test(d.selector))).toBe(true);
  });

  it("a reveal finishes inside the 300 ms motion budget (stagger delay + transition)", () => {
    const { tab, max } = MOTION.duration;
    expect(STAGGER_TOTAL_MS + tab).toBeLessThanOrEqual(max);
    for (let count = 1; count <= 40; count++) {
      let previous = -1;
      for (let i = 0; i < count; i++) {
        const delay = wordDelayMs(i, count);
        expect(delay, `word ${i}/${count}`).toBeGreaterThanOrEqual(previous);
        expect(delay + tab, `word ${i}/${count}: ${delay} ms delay + ${tab} ms transition`).toBeLessThanOrEqual(max);
        previous = delay;
      }
      expect(wordDelayMs(0, count)).toBe(0);
    }
    // The CSS transitions of blocks and words use --dur-tab (200 ms), never --dur-slow / --dur-max.
    const transitions = declarations(css, /^\s*transition\s*:/).filter((d) => d.selector === ".reveal" || d.selector === ".word-reveal .word");
    expect(transitions.map((d) => d.selector).sort()).toEqual([".reveal", ".word-reveal .word"]);
    for (const d of transitions) {
      expect(d.text, d.selector).toMatch(/var\(--dur-tab\)/);
      expect(d.text, d.selector).not.toMatch(/--dur-(?:slow|max)/);
    }
    // Sibling stagger (<Reveal delay>) is capped to the same window.
    expect(readFileSync("src/components/landing/reveal.tsx", "utf8")).toContain("Math.min(delay, STAGGER_TOTAL_MS / 1000)");
  });

  it("WordReveal keeps its words in the accessibility tree (no aria-label stand-in, no aria-hidden words) and the heading text", () => {
    const code = readFileSync("src/components/landing/reveal.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/aria-hidden|aria-label|role=/);
    // Every WordReveal title, in both languages: the words joined by single spaces are exactly the title (so the accessible name is unchanged).
    const at = (tree: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], tree) as string;
    const titles = [
      "landing.heroAccent",
      "landing.featuresTitle",
      "landing.scenes.copilot.title",
      "landing.scenes.agents.title",
      "landing.scenes.knowledge.title",
      "landing.scenes.integrations.title",
      "landing.templatesTitle",
      "onboarding.step2Title",
      "onboarding.step3Title",
    ];
    for (const msgs of [ar, en]) {
      for (const key of titles) {
        const text = at(msgs, key);
        expect(typeof text, key).toBe("string");
        expect(wordRuns(text).flatMap((r) => r.words.map((w) => w.text)).join(" "), key).toBe(text.trim().replace(/\s+/g, " "));
      }
    }
  });

  it("wordRuns isolates a Latin phrase inside an RTL title (inline-block words are bidi neutrals) and leaves other titles as one run", () => {
    const shape = (text: string) => wordRuns(text).map((r) => [r.latin, r.words.map((w) => w.text).join(" ")]);
    expect(shape("Automate anything now")).toEqual([[true, "Automate anything now"]]);
    expect(shape("اربط Google Sheets بسهولة")).toEqual([[false, "اربط"], [true, "Google Sheets"], [false, "بسهولة"]]);
    expect(shape("أتمت أي شيء")).toEqual([[false, "أتمت أي شيء"]]);
    // A word with no letters (dash, number) stays with the run before it.
    expect(shape("Slack — Gmail")).toEqual([[true, "Slack — Gmail"]]);
    expect(shape("أرسل — Slack 2")).toEqual([[false, "أرسل —"], [true, "Slack 2"]]);
    // Stagger slots follow the position in the whole title, across runs.
    expect(wordRuns("اربط Google Sheets بسهولة").flatMap((r) => r.words.map((w) => w.index))).toEqual([0, 1, 2, 3]);
    expect(wordRuns("")).toEqual([]);
    expect(declarations(css, /^\s*unicode-bidi\s*:\s*isolate\s*$/).map((d) => d.selector)).toContain(".word-reveal .word-run");
  });

  it("feature scenes: no sr-only text inside the aria-hidden rail, and the providers list is named by an i18n label (not the section title)", () => {
    const code = readFileSync("src/components/landing/feature-scenes.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/sr-only/);
    expect(code).toContain("aria-label={providersAria}");
    expect(code).not.toContain("aria-label={title}");
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain('providersAria={t("shell.nav.integrations")}');
  });

  it("landing illustrations use plain landing subtitles and preserve product catalogue labels", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    expect(page).not.toContain("nodeText");
    expect(page.match(/sub: t\("landing\.flowNodes\.\w+Sub"\)/g)).toHaveLength(5);
    expect(page.match(/sub: t\("landing\.heroNodes\.\w+Sub"\)/g)).toHaveLength(3);
    for (const messages of [ar, en]) {
      const strings = (value: unknown): string[] => typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>).flatMap(strings);
      expect(strings(messages.landing).join(" ")).not.toMatch(/JSONATA|JSON|IF \/ ELSE|TRIGGER ·|\b(?:nodes?|graph|agents?)\b|عُقد|عقدة|مخطط|وكلاء/i);
    }
    expect(Object.keys(ar.landing.heroNodes)).toEqual(Object.keys(en.landing.heroNodes));
    expect(Object.keys(ar.landing.flowNodes)).toEqual(Object.keys(en.landing.flowNodes));
    expect(page).toContain("var(--canvas-dot)");
    expect(page).toContain("bg-elevated");
    expect(readFileSync("src/components/landing/flow-scene.tsx", "utf8")).toContain("var(--canvas-dot)");
  });

  it("form-control boundaries use line-control (≥3:1, WCAG 1.4.11), never the lighter divider token", () => {
    for (const f of ["src/components/ui/fields.tsx", "src/components/secret-input.tsx", "src/components/builder/palette.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("border-line-control");
      expect(src, f).not.toContain("border-line-strong");
    }
  });

  it("the landing hero dots use each node's real category hue, not hand-picked colours", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    expect(page).toMatch(/CATEGORY_HUE\[NODE_DEFINITIONS\[/);
    expect(page).not.toMatch(/hue: "(trigger|logic|ai|app|output)" as const/);
  });

  it("the Copilot scene and the features intro say it is experimental, like the app's own Copilot label", () => {
    expect(en.copilot.beta).toBe("Experimental");
    expect(en.landing.featuresBody).toMatch(/Copilot is still experimental/);
    expect(ar.landing.featuresBody).toContain(ar.copilot.beta);
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain('badge: t("copilot.beta")');
  });

  it("Lenis ships its recommended stylesheet and handles #anchor links", () => {
    const root = readFileSync("src/components/landing/scroll-root.tsx", "utf8");
    expect(root).toContain('import "lenis/dist/lenis.css";');
    expect(root).toMatch(/new Lenis\(\{[^}]*anchors:\s*true/);
  });
});
