# Flowline design system

One system, every surface: colors and motion come from a single documented source, and screens compose
owned components instead of hand-rolling styles. The living reference is the internal **`/design-system`**
page (development and `FLOWLINE_ENV=test`; other production builds return 404).

## Principles

1. **Tokens before classes.** Components and screens use *semantic* tokens only — never a primitive
   scale, never raw hex. `tests/unit/design-system.test.ts` checks violations in
   `src/components/**` and `src/app/**`.
2. **Color has meaning.** A hue always says the same thing everywhere (see "Color usage" below).
3. **Motion is feedback.** Every action shows what happened — through the motion primitives baked into
   the components, ≤ 300 ms, transform/opacity only, no layout shift, RTL-correct, and fully disabled
   under `prefers-reduced-motion` (running states become a static ring).
4. **Honesty.** Animations celebrate only real, server-confirmed outcomes. No fake success, metrics or
   claims — in UI and on the public pages alike.
5. **Arabic-first.** RTL is the default reading direction; machine text (IDs, URLs, JSON) stays LTR.

## Tokens

The single source of truth is **`src/design/tokens.ts`**. `pnpm tokens` regenerates:

- `src/design/tokens.generated.css` — imported by `src/app/globals.css` (Tailwind v4 `@theme`); and
- `src/design/tokens.json` — W3C DTCG export (see "Other platforms").

Both are checked in, and a unit test fails when they're stale.

### Layer 1 — primitives

Color scales per hue (`neutral`, `brand`, `violet`, `sky`, `emerald`, `amber`, `rose`, `orange`), plus
radius (`sm 4 · md 6 · lg 8 · xl 12`), the Inter type scale (`xs 11 · sm 12 · base 13 · lg 16 · xl 20 ·
2xl 26`) and motion (`duration fast 80 · base 150 · tab 200 · slow 250 · max 300` ms; `easing standard
(0.4,0,0.2,1) · emphasized (0.16,1,0.3,1) · exit (0.4,0,1,1)`). **Never referenced by components.**

### Layer 2 — semantic (per theme)

Defined for `dark` and `light` (the application default); `[data-theme="system"]` follows `prefers-color-scheme`.
The generated CSS's bare `:root` fallback remains dark; `src/app/layout.tsx` applies the resolved theme explicitly.

| Token | Utility | Meaning |
|---|---|---|
| `bg` `surface` `card` `elevated` | `bg-app` `bg-surface` `bg-card` `bg-elevated` | page base · sidebar/header · cards/nodes · popovers |
| `line` `line-strong` | `border-line` `border-line-strong` | 1px dividers and card/button edges, always — deliberately quiet (1.0–1.9:1), so never the only cue for a control |
| `line-control` | `border-line-control` | the boundary of a **form control** (`Input`, `Textarea`, `Select`, the search and secret fields): ≥ 3:1 on every surface, both themes (WCAG 1.4.11) |
| `text-hi` `text-med` `text-muted` | `text-hi` `text-med` `text-muted` | titles · secondary · metadata (all AA) |
| `accent` `accent-hover` `accent-press` `on-accent` | `bg-accent` `hover:bg-accent-hover` `text-on-accent` … | the brand **fill**: primary buttons, focus rings, borders, edges, dots — never accent-coloured text |
| `accent-text` | `text-accent-text` | accent-coloured **text**: links, accent `Badge`/`StatusBadge`, active nav icon (AA on every surface and on the accent tint) |
| `success` `warning` `danger` `info` | `text-success` … | run/step status, badges |
| `cat-trigger` `cat-logic` `cat-ai` `cat-app` `cat-output` | `text-cat-ai` … | canvas node category hues |
| `canvas-dot` `minimap-*` `scrim` | `bg-scrim` … | React Flow chrome (also read from JS), overlay scrims |

Each of `accent/success/warning/danger/info/cat-*` also has `-bg` (12 % tint) and `-border` (45 % tint)
variants — `bg-danger-bg`, `border-warning-border`. The brand gradient is the `bg-brand` class (one
token, both themes). The accent tint is derived from the accent **fill**; the text on it is `accent-text`.
The tints are declared **inside every theme block** (`:root, [data-theme="dark"], [data-theme="system"]`,
`[data-theme="light"]`, and the light `system` media block), not once on `:root`: a custom property that reads
`var(--accent)` is resolved where it is declared, so a nested `[data-theme]` panel (the `/design-system` guide
shows dark and light side by side) would otherwise inherit the root theme's tint. `tests/unit/design-system.test.ts`
checks every block.

### Values and contrast (WCAG AA)

The accent fill keeps the design deck's brand colour (`design-reference/DESIGN-REFERENCE.md`: accent
`#7C6CFF`, dark). That colour is too light on the light theme and too dark on the tint of the dark theme to be
plain text, so accent-coloured text is a **separate token** (`accent-text`) instead of darkening/lightening the fill.
`tests/unit/design-system.test.ts` computes every pair below from `src/design/tokens.ts` (nothing hard-coded) and
also asserts the dark accent equals the deck value.

| Token | Dark | Light | Contrast (min over `bg`/`surface`/`card`/`elevated`) |
|---|---|---|---|
| `accent` (fill) | brand.500 `#7C6CFF` (deck) | brand.600 `#6A5AE8` | ≥ 3:1 as graphics: dark 3.86, light 4.51 |
| `accent-hover` | brand.400 `#8E80FF` | brand.700 `#584AD4` | `on-accent` on it: dark 6.33, light 6.01 |
| `accent-press` | brand.550 `#7566F7` | brand.800 `#4739B8` | `on-accent` on it: dark 4.74, light 7.90 |
| `on-accent` | neutral.950 `#09090B` | neutral.50 `#FAFAFA` | on `accent`: dark 5.16, light 4.74 |
| `accent-text` | brand.350 `#9D92FF` | brand.700 `#584AD4` | plain text: dark 5.67, light 5.71; on the accent tint: dark 4.93, light 4.91 |
| `success` `cat-output` | emerald.400 | emerald.800 `#065F46` | text ≥ 7.75 dark / 6.99 light; on own tint ≥ 6.08 / 5.80 |
| `warning` `cat-trigger` | amber.400 | amber.800 `#92400E` | text ≥ 8.92 / 6.45; on own tint ≥ 6.85 / 5.36 |
| `cat-logic` | orange.400 | orange.800 `#9A3412` | text ≥ 6.58 / 6.65; on own tint ≥ 5.32 / 5.50 |
| `danger` | rose.400 | rose.700 `#BE123C` | text ≥ 5.53 / 5.72; on own tint ≥ 4.61 / 4.68 |
| `info` `cat-app` | sky.400 | sky.700 `#0369A1` | text ≥ 6.95 / 5.40; on own tint ≥ 5.57 / 4.54 |
| `cat-ai` | violet.400 | violet.700 `#6D28D9` | text ≥ 5.47 / 6.46; on own tint ≥ 4.51 / 5.35 |
| `text-med` `text-muted` | neutral.400 · 450 (`#94949C`) | neutral.600 · 550 (`#6D6D76`) | ≥ 5.81 · 4.95 dark, ≥ 7.03 · 4.66 light |
| `line-control` (control border) | neutral.475 `#7C7C85` | neutral.475 `#7C7C85` | ≥ 3:1 non-text (WCAG 1.4.11): dark 3.60 (`elevated`) – 4.81 (`bg`), light 3.76 (`bg`) – 3.96 |
| `line` · `line-strong` (dividers) | neutral.800 · 700 | neutral.200 · 300 | not measured on purpose: dark 1.0–1.3 · 1.4–1.9, light 1.15–1.22 · 1.34–1.42 — they separate, they do not identify a control |

Three intermediate primitives exist only to make a contrast rule pass while keeping the deck fill: `brand.350` (dark
`accent-text`) and `brand.550` (dark `accent-press`; the deck's brand.600 gives only 4.0:1 under near-black
`on-accent`), and `neutral.475` (the control boundary: one shared step that clears 3:1 on the tightest surface of each
theme at once — `bg` in light, `elevated` in dark). Neutral steps `450`/`550` serve the muted text
the same way. Controls fill with `bg` (`bg-app`) and sit on `surface`/`card`/`elevated`, so the boundary is
measured against all four; the focus state swaps the border to `accent` (`focus:border-accent`).

**Known trade-off — amber vs orange in the light theme.** To reach 4.5:1 on their own 12 % tints, light `warning`/
`cat-trigger` (amber.800 `#92400E`) and `cat-logic` (orange.800 `#9A3412`) both land in dark brown-red and are
nearly indistinguishable by hue alone (contrast between them 1.03:1; in dark: 1.36:1). Category chips always carry
a text label, so the hue is not the only cue, but on the light theme trigger vs logic should not be told apart by
colour alone. Lighter amber/orange steps would fail AA text on the tint; the decision is to keep AA.

## Color usage (which hue means what)

- **Brand violet** — primary accent (buttons and focus rings use the `accent` fill; links and accent badges use
  `accent-text`) **and AI** (Copilot, AI nodes).
- **Sky** — information and running; apps/integrations category.
- **Emerald** — success and completions; output category.
- **Amber** — warnings and triggers.
- **Orange** — logic (condition, loop, data transforms, code).
- **Rose** — danger: failures and destructive actions. Nothing else.

Usage bars shift hue with fill: emerald → amber ≥ 75 % → rose ≥ 90 %. Template and integration
*category labels* stay plain text — color marks **status**, not taxonomy.

## Components (`src/components/ui/`)

Owned, shadcn-style: Radix primitives for behaviour, cva for typed variants, our tokens for all styling.
`cn()` = `clsx` + `tailwind-merge`.

| Component | Props / variants | Notes |
|---|---|---|
| `Button` `ButtonLink` `IconButton` | `variant` primary/secondary/ghost/danger/danger-ghost · `size` sm/md/lg · `loading` · `confirm` · `disabledReason` | press motion built in; `confirm` shows the animated check — set it only after a real success |
| `Badge` `StatusBadge` `Dot` | `tone` success/warning/danger/info/muted/accent | filled chip / dot+label / dot |
| `CategoryChip` | node `category` or hue | the five category hues |
| `Card` `SectionLabel` `Kbd` | — | surfaces and labels |
| `Input` `Textarea` `Select` `Field` | `invalid`, `mono`; Field: `label/hint/error` | `Select` is a styled **native** select on purpose (platform behaviour + `selectOption` in E2E) |
| `Tabs` `TabPanel` | controlled `tabs/value/onChange` | Radix: WAI-ARIA keyboard, panels fade in |
| `Dialog` `Drawer` | `open/onOpenChange/title` | Radix focus trap; motion on open **and** close |
| `Menu*` `Popover*` `Tooltip` | Radix dropdown/popover/tooltip | roving focus, typeahead, escape/scrim close |
| `Toast` (`components/toast.tsx`) | `useToast()(msg, tone)` | slide in/out via the motion library |
| `Skeleton` `EmptyState` `ErrorState` `UsageBar` | — | shimmer; states with recovery actions; hue-follows-fill meter |
| `Logo` | — | brand gradient swatch |
| `useConfirm` | `{ confirmed, flash }` | confirmation state for server-confirmed actions |
| `NAV_ICONS` `NODE_ICONS` `CATEGORY_ICONS` | lucide set | one icon family everywhere |

## Motion rules

- Durations: press 80 · hover/color 150 · tabs/badges 200 · drawer/toast 250 · hard ceiling **300 ms**.
  Running-state loops may loop while a run is live.
- Easings: `emphasized` (expo-out) for entering elements, `standard` for in-place changes, `exit` for
  leaving elements.
- Purpose-named primitives (in `globals.css`, consumed by components — screens never hand-write
  keyframes): `motion-enter` (panels/tab switches), `motion-pop` (menus/popovers), `motion-list-in`
  (new list items), `motion-toast-in/out`, `motion-node-in/out` (canvas add/delete), `motion-running`
  (glow loop in the node's `--run-hue`), `motion-shake` (one shot, failures), `motion-confirm` +
  `motion-check-draw` (success), `motion-select-pulse`, `motion-success-flash`, `motion-press`
  (scale-down), `skeleton` shimmer, `m-edge-flow`/`m-edge-draw` (canvas edges).
  `animation` is a single property, so two primitives on one element replace each other (the later rule wins):
  `motion-select-pulse` therefore draws its ring on `::after` (host: positioned, not overflow-clipped) and a selected
  running node keeps its `motion-running` glow.
- **Reduced motion:** a global media query disables all animation; `motion-running` degrades to a
  static ring; the motion library runs under `MotionConfig reducedMotion="user"`; scroll scenes on the
  public pages render fully static (and fully readable) versions.
- **Scroll-linked motion** (landing/public pages only) is exempt from the 300 ms rule because it
  follows the scroll; it still animates only transform/opacity, is lighter on mobile, mirrors in RTL
  and ships static content without JS. The pinned hero scrubs from the **wrapper's** named view timeline
  (`.hero-pin { view-timeline: --hero-pin block }`, `.hero-scrub { animation-timeline: --hero-pin; animation-range:
  contain 0% contain 100% }`), because a `view()` on the element inside the sticky stage would not advance while pinned.
  The pin, the timeline and the scrub live in one `@supports (animation-timeline: view())` + `(min-width: 1024px)` +
  `(prefers-reduced-motion: no-preference)` block.
- **Scroll reveals are not scroll-linked**, so they obey the 300 ms budget: a block fades over 200 ms after at most
  100 ms of sibling delay; `WordReveal` spreads its per-word delays over at most 100 ms (long titles compress) with a
  200 ms transition per word. Words stay ordinary text in the accessibility tree (nothing `aria-hidden`); a run of Latin
  words inside an Arabic title is wrapped in one `dir="ltr"` isolate so it keeps its word order.

## Do / don't

```tsx
// DO — semantic tokens, typed variants, motion from the component
<Button variant="primary" confirm={saved.confirmed}>Save</Button>
<span className="border-danger-border bg-danger-bg text-danger">…</span>
<a className="text-accent-text hover:underline" href="/x">Link</a>
<li className="motion-list-in">…</li>

// DON'T — primitives, raw hex, hand-rolled animation, accent fill as text
<button className="bg-violet-600">Save</button>
<a className="text-accent" href="/x">Link</a>  // accent is the fill; links use text-accent-text
<span style={{ color: "#f87171" }}>…</span>
<style>{`@keyframes myFade …`}</style>
```

## Theming

`fl_theme` cookie = `light | dark | system` (default light, including invalid values), written client-side like `fl_locale` and
applied **on the server** to `<html data-theme>` (no flash). The switch lives in the user menu (radio
items) and on the auth pages (`ThemeSwitcher`). Canvas chrome that needs concrete colors in JS
(MiniMap/Background) reads the tokens through `useCanvasColors()`.

## Other platforms

Tokens are platform-neutral **data**, so a future desktop or mobile app maps them 1:1:

- `src/design/tokens.json` (generated, W3C DTCG) carries primitives inline and semantic tokens as
  `{references}` per theme, plus radius, typography and motion (ms + cubic-bezier arrays).
- A **desktop app** (Tauri/Electron) can reuse this web UI as-is — the same CSS variables apply.
- A **mobile app** (React Native + NativeWind) reuses the same theme names (`bg-surface`, `text-hi`,
  `cat-ai`) and maps `tokens.json` values into its NativeWind theme; motion values are plain data
  (`duration.fast = 80`, `easing.emphasized = [0.16, 1, 0.3, 1]`) ready for Reanimated.
- Framework-neutral names are a hard rule: no `dark:`-style framework idioms inside token names.

## Libraries (exact versions pinned in package.json)

Tailwind v4 · class-variance-authority (typed variants) · clsx + tailwind-merge (`cn`) · Radix UI
primitives (dialog, dropdown-menu, popover, tooltip, tabs, direction — accessible behaviour;
our tokens do the styling) · motion (app animation + scroll-linked public pages) · lenis (smooth
scrolling, public pages only) · lucide-react (one icon set). See `artifacts/design-v2/NOTES.md` for
versions and rationale.
