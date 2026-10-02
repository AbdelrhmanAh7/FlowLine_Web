# Customize Flowline's design tokens

Flowline already has one token source for the app. Edit [`src/design/tokens.ts`](../../src/design/tokens.ts), then regenerate its checked-in outputs. Do not edit `src/design/tokens.generated.css` or `src/design/tokens.json` by hand.

The app uses Tailwind CSS v4. [`src/app/globals.css`](../../src/app/globals.css) imports Tailwind and the generated CSS; the generated file declares `@theme` variables and utilities such as `bg-accent`, `text-hi`, and `rounded-md`. There is no Tailwind v3 `tailwind.config.js` palette to edit for this setup. The `/design-system` page shows the existing tokens and components in both themes in development and the test environment.

## Change the primary accent

Most screens use semantic classes. For example, primary buttons and focus indicators use `accent`; links use `accent-text`. Change the semantic mappings once and those classes pick up the values across the app.

Accent values are intentionally selected per theme in `SEMANTIC`:

| Role | Dark mapping | Light mapping |
| --- | --- | --- |
| Main fill | `SEMANTIC.dark.accent` → `brand.500` | `SEMANTIC.light.accent` → `brand.600` |
| Hover fill | `SEMANTIC.dark["accent-hover"]` → `brand.400` | `SEMANTIC.light["accent-hover"]` → `brand.700` |
| Pressed fill | `SEMANTIC.dark["accent-press"]` → `brand.550` | `SEMANTIC.light["accent-press"]` → `brand.800` |
| Text on the fill | `SEMANTIC.dark["on-accent"]` → `neutral.950` | `SEMANTIC.light["on-accent"]` → `neutral.50` |
| Accent text and icons | `SEMANTIC.dark["accent-text"]` → `brand.350` | `SEMANTIC.light["accent-text"]` → `brand.700` |

To shift the violet brand toward another hue while keeping the existing scales, adjust the referenced `PRIMITIVE_COLORS.brand` shades in `src/design/tokens.ts`, then review every role above. The dark and light fill shades are different by design. A single hex value cannot safely supply button fills, hover and pressed states, links, and text on every background; the semantic roles let one palette change propagate while preserving separate contrast choices. Keep `accent` for fills and use `accent-text` for text. Do not use `text-accent`.

For example, changing the dark button fill means choosing a replacement for `PRIMITIVE_COLORS.brand["500"]` (currently `#7c6cff`), since `SEMANTIC.dark.accent` references `brand.500`. The matching light fill uses `brand["600"]` (currently `#6a5ae8`). Update the other referenced brand shades as needed; do not point both themes at one shade without checking contrast.

Status and node-category colors are separate semantic roles: `SEMANTIC.dark.success` (and the equivalent light-theme entry), `warning`, `danger`, `info`, and `SEMANTIC.dark["cat-trigger"]`, `SEMANTIC.dark["cat-logic"]`, `SEMANTIC.dark["cat-ai"]`, `SEMANTIC.dark["cat-app"]`, and `SEMANTIC.dark["cat-output"]` (each also has a light-theme entry). Leave those roles distinct so success, warnings, failures, information, and node types keep their meaning. Accent tints (`accent-bg`, `accent-border`) are generated from the per-theme accent automatically.

## Other shared values

- **Surfaces and text:** edit `SEMANTIC.dark` and `SEMANTIC.light` entries such as `.bg`, `.surface`, `.card`, `.elevated`, `.line`, `.["text-hi"]`, `.["text-med"]`, and `.["text-muted"]`. Components consume semantic Tailwind utilities such as `bg-app`, `bg-card`, `border-line`, and `text-med`.
- **Corners:** edit `RADIUS` (`sm`, `md`, `lg`, `xl`). Tailwind exposes these as `rounded-sm`, `rounded-md`, `rounded-lg`, and `rounded-xl`.
- **Type scale:** edit `TEXT`. Its entries generate Tailwind `text-*` sizes with line-height and optional letter-spacing. Font families are set separately in the `@theme` block in `src/app/globals.css` (`--font-sans` and `--font-mono`).
- **Motion:** edit `MOTION.duration` and `.easing`. Utilities such as `duration-[var(--dur-base)]` resolve to the generated values. Keep the maximum at or below 300 ms, and preserve the reduced-motion handling in `globals.css` and the motion components.

## Regenerate and review

Run focused local checks while developing. GitHub Actions runs the fast gate on PRs and the full gate before changes reach `main`; see the [developer guide](../DEVELOPER_GUIDE.md#verification-and-handoff) for how to read results and rerun a tier.

After editing `src/design/tokens.ts`, run `pnpm tokens`. This rewrites both generated files. Then run the targeted token test and the normal source checks:

```sh
pnpm test -- tests/unit/design-system.test.ts
pnpm typecheck
pnpm lint
```

The token test checks that generated outputs match the source, rejects raw colors and primitive-palette utilities in app/components, and verifies key contrast pairs. A green test does not replace a visual check of the actual interface. Open `/design-system` and review dark, light, system, and nested light/dark examples; inspect buttons, links, disabled/focus states, controls, status chips, and canvas categories.

For a manual WCAG AA review, check normal text at **4.5:1 or higher** against every surface it appears on. Check text on accent and status fills, and `accent-text` on surfaces and the accent tint. Check control boundaries and meaningful graphical indicators at **3:1 or higher**. The repository's contrast helpers and `tests/unit/design-system.test.ts` show the project-specific pairs. Keep status meaning available through labels or icons as well as color.

This guide documents the existing token system; the route-wide raw-color scan for this pass found no hex colors, Tailwind palette shade classes, Tailwind black/white color classes, or primitive color variables in `src/**/*.tsx`.
