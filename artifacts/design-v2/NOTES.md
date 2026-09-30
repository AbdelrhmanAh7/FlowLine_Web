# design-v2 design system: notes

## Beta continuation — 2026-09-30

Binding brief accepts U1 narrower landing, U2 current template/integration density and U3 nine settings tabs for private beta where usable and accessible. These decisions do not waive defects, and no further redesign/light-mode/local-model work is introduced.

Journey 9 is now complete: final-keyboard/REPORT.md and SURFACES.md map 225 passing checks and a preserved wrong-launcher attempt subsequently corrected across cp16/cp18/cp20. Current product/E2E equals cp20; cp21 adds only the shared-close-handler unit assertion. Retained browsers pass 114/50/50; current non-browser gate passes unit/contract/integration 388/465/460. Current gate: gate/final-keyboard/GATE.md; beta coverage: ../beta-execution/20260930T122429Z/COVERAGE.md. Historical cp12 sections remain historical.

DV2-02's other two disposable configurations are remediated with fresh DBs and independent keys; old DBs preserved, no old-key fallback. Named dev/staging reuse audit is clean, 2,592 history text blobs have zero affected-key hits. R01–R04 remain open for impact review. Claude review is pending; the primary executor's checks are not independent visual/security review. Actual dedicated headed Chrome 154.0.8037.92 via Playwright 1.63.0 is verified; native apps are unavailable, no personal profile was operated. External login is owner takeover with automation idle and recording off.

MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. No worktree deletion, real invitations, provider spending or Pi/DNS changes.

The owner approved design-v2 on 2026-09-29: a colourful palette refresh, a light theme with Light / Dark / System, clear
motion on every action, Apple-style scroll motion on the public pages, and a real design system (not "spaghetti") that
desktop and mobile apps can reuse. The approved reference remains `design-reference/` (the v1 deck, dark).

- **Status:** local branch `design-v2`. It is **not pushed, not merged, and not production-approved.**
- **Bugs and verification:** [`BUGS.md`](BUGS.md). The final gate is linked at the end.

## 1. What the system contains
**Tokens** (`src/design/tokens.ts`; generated with `pnpm tokens` → `src/design/tokens.generated.css` and the platform-neutral
W3C DTCG `src/design/tokens.json`):
- **Primitives:**
  - colour scales: neutral with the AA steps 450/475/550; brand (violet) 300–800 with the AA steps 350/550; violet,
    sky, emerald, amber, rose, orange;
  - radius, the type scale (`--text-base` 13 px / 20 px, as in the deck), and motion durations (80/150/200/250/300 ms)
    and easings.
- **Semantic tokens,** per theme (`:root`/`[data-theme=dark|system]`, `[data-theme=light]`, and System following the OS):
  - surfaces (`bg`, `surface`, `card`, `elevated`);
  - lines (`line`, `line-strong`, and `line-control` for form-control boundaries);
  - text (`text-hi`/`med`/`muted`);
  - accent (`accent` fill = the deck brand `#7C6CFF`, `accent-hover`/`press`, `on-accent`, `accent-text` for text);
  - status (`success`/`warning`/`danger`/`info`, with `-bg`/`-border` tints emitted in every theme block);
  - category hues (`cat-trigger`/`logic`/`ai`/`app`/`output`);
  - canvas and landing glow tokens.
- **Guards** (`tests/unit/design-system.test.ts`, 300+ assertions): generated files up to date; no raw colours,
  Tailwind palette classes or primitive variables in `src/app`/`src/components`; WCAG AA text contrast for every
  semantic pair in both themes; control boundaries ≥3:1; the brand fill equals the deck value; motion budgets;
  reduced-motion rules.

**Components** (`src/components/ui/*`, class-variance-authority, Radix primitives, semantic tokens only):
- **Button:** primary/secondary/ghost/danger, sizes, `loading`, and `confirm`, which keeps its accessible name and
  width. `disabledReason` is the accessible description (always in the DOM, outside the button) and a tooltip, and on
  touch a tap shows it.
- **Status and cards:** Badge / StatusBadge / Dot / CategoryChip, Card.
- **Tabs:** keyboard roving; a tab with `disabledReason` is `aria-disabled`, skipped by the arrow keys, and explained.
- **Dialog and Drawer** (Radix modal): a shared `useReturnFocus` returns focus to the opener, and the Drawer has a
  phone `sheet` variant.
- **Menu, Popover, Tooltip** (`openOnTap` for touch).
- **Fields:** Input, Textarea, a native Select with a chevron; SecretInput is uncontrolled and write-only.
- **Feedback:** Spinner, Skeleton, EmptyState, UsageBar (a named meter).
- **Icons:** lucide.

**Public-page motion** (`src/components/landing/*`): Reveal / WordReveal, HeroPin, FlowScene, FeatureScenes, Magnetic,
ParallaxGradients, and ScrollRoot (Lenis with its stylesheet and anchor support).

**Style guide:** `/design-system`. It returns 404 in production builds unless `FLOWLINE_ENV=test`.

**Themes:**
- The `fl_theme` cookie is read on the server into `<html data-theme>`, so there's no flash.
- `ServerThemeProvider` gives client hooks the server-known theme, so the switcher and the canvas colours hydrate
  correctly.

## 2. What matches the design reference
Codex's visual review compared app regions only, in real Chrome (`visual-review/REPORT.md`, 123 screenshots). These
match the deck:
- **Structure:** the dark surface hierarchy, the compact controls, and 13/20 px Inter / IBM Plex Sans Arabic type.
- **Screens:** the 240 px sidebar; the builder (dot grid, curved edges, node anatomy, minimap, drawer); the run
  inspector's step chain and tabs; the dashboard's KPI → flows → activity order; auth's split composition; dialogs.
- **Layout behaviour:** RTL mirroring, and responsive tablet and phone shells, with phone monitor-only mode.

## 3. Intentional differences (approved) and why

| Difference | Why |
|---|---|
| A more colourful palette and more vivid category hues | Owner-approved colour refresh; the brand fill is still the deck `#7C6CFF`. |
| Light theme, plus Light/Dark/System | Owner-approved. The deck has no light screens, so the light theme is judged for consistency and legibility. |
| **`accent-text`** separate from the accent fill; darker light-theme status hues (emerald / amber / orange 800, rose / sky / violet 700) | WCAG AA text contrast on surfaces and tints. `on-accent` is near-black in dark mode, because white on `#7C6CFF` is only 3.86:1. |
| `line-control` (neutral.475) for input/select borders | WCAG 1.4.11: form-control boundaries ≥3:1 in both themes. |
| Motion: ≤300 ms feedback (drawer 250 ms, fades 150 ms, select pulse / check 300 ms); scroll motion on public pages only | Owner-approved. Everything is static under `prefers-reduced-motion`, with no hidden content and no dead scroll space. The hero scrub runs only at ≥1024 px with scroll-timeline support. |
| Copilot glyph "✦" replaced by a lucide icon | Consistent iconography. The accessible name is now "Copilot" (see §6). |
| Landing header: two rows below 1024 px; icon-only theme buttons below 1280 px; switchers on phones | DV2-Q03/Q04: no overflow at 768 px, and phone visitors can change language and theme. |

## 4. Owner decisions (flagged by the visual review, not defects)
- **U1, landing composition:** narrower than slide 5. This is **design-v2's own change**: the illustration lost its
  `max-w-4xl` frame when the landing was rebuilt for scroll motion. Keep it, or move closer to the deck?
- **U2, template/integration density:** three columns and taller cards. This **predates design-v2** (same grid on
  `phase-4`).
- **U3, settings structure:** 9 tabs instead of the deck's combined page. This **predates design-v2**: 7 tabs in Phase 4,
  plus AI Providers and OAuth apps from the AI hub.

## 5. Accessibility and responsive decisions
- **Contrast:** text contrast AA and control boundaries ≥3:1 are asserted from the tokens, in both themes.
- **Target size (WCAG 2.5.8):** switchers are ≥24 px, and ≥32 px on phones (DV2-L01). The root font is 13 px, so rem
  sizes are 13/16 of nominal; size touch targets accordingly.
- **Dialogs:** they return focus to their opener (DV2-Q02). The phone run inspector is a named modal sheet with Escape
  and focus return (DV2-Q05). Errors inside dialogs are inline `role="alert"`.
- **Arabic-first:**
  - Generated run/step messages are translated by stable code in the UI (DV2-Q01). English output is byte-identical,
    and a drift guard is in place.
  - User-authored names are bidi-isolated with `<bdi>` (DV2-V03).
  - WordReveal keeps Latin phrases in reading order.
  - Illustrations use the translated node catalogue (DV2-V02).
- **Disabled controls:** they explain themselves by hover, focus, screen reader and tap.
- **Reduced motion:** fully static, and checked in unit and E2E tests (`landing`, `reduced-motion`, `run-states`,
  `hydration`).

## 6. E2E-visible changes (deliberate; tests updated or added, no assertion removed)

Owner landing request (2026-09-30): deliberate landing-only change supersedes DV2-V02 catalogue subtitles. Plain Arabic-first visitor copy uses landing.heroNodes/flowNodes subtitles; product nodes.* remain unchanged. Real category hues are retained. Hero and flow boards use --canvas-dot, elevated cards, strong borders and existing semantic shadows. Free examples are distinguished from possible external app/AI costs. New screenshots and gate pending; no readiness claim.
- **Copilot button** accessible name is "Copilot" (`phase3.spec`, `responsive.spec` use `exact: true`).
- **`run-states.spec`:** the flowing edge is asserted attached (a horizontal SVG has zero height), and its animation is
  still asserted.
- **`reduced-motion.spec`:** the duration is compared numerically.
- **`phase2.spec` "repair a connection"** (DV2-01): waits for the real OAuth return (`?oauth=reconnected`) and for the
  dialog to close.
- **`responsive.spec`:**
  - Captures go to `E2E_SCREENSHOT_DIR` (the default is unchanged).
  - The phone branch asserts the named modal run sheet, Escape, and focus return. Desktop is unchanged.
- **New test ids and ids:** `rerun-error`, `rotate-error`, `run-sheet`, `landing-preferences`, `run-row-<id>`. The scrim
  button "Close step details" was removed (Escape and the panel's Close remain).
- **New tests:**
  - `landing.spec`: header fit at 15 widths × en/ar × light/dark, phone switching, keyboard, and reveals/hero-scrub.
  - `hydration.spec`: the public routes in Arabic + light.
  - The motion specs cancel their held run in `afterEach`.

## 7. Dependencies (vs `phase-4`)
- Radix `react-dialog` 1.1.23, `-direction` 1.1.4, `-dropdown-menu` 2.1.24, `-popover` 1.1.23, `-tabs` 1.1.21,
  `-tooltip` 1.2.16.
- `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0.
- `motion` 13.4.4, `lenis` 1.3.26, `lucide-react` 1.48.0.
- `@radix-ui/react-select` was added and later removed as unused. All licences are MIT/ISC/Apache-2.0.

## 8. Remaining limitations (open, with severity)
- **P3, DV2-Q01a:** provider- and engine-originated payload text (e.g. JSONata/zod messages, raw provider errors) and
  some rarer AI codes are shown in their original language.
- **P3, DV2-Q04a:** below 1024 px the keyboard order of the landing header (preferences → account) differs from the
  visual order.
- **P3:** in the light theme, amber (trigger) and orange (logic) look alike. Every place also has an icon and text, so
  colour is never the only cue.
- **P3:** "System" users on a light OS see dark canvas dots until hydration (the server can't know the OS).
- **Not measured:** Lighthouse scores. **Not verified:** live providers; all QA used test doubles.
- **DV2-02 follow-up (owner):** rotate the exposed test key in `FlowLine/.env.test` and `FL-wt-aihub/.env.test`.

## 9. Evidence

| What | Where |
|---|---|
| Independent Chrome QA (Codex, headed Chrome 153, cp4) | `chrome-qa/REPORT.md` (152 screenshots) |
| Visual review against the deck (Codex, cp4) | `visual-review/REPORT.md` (123 screenshots) |
| Retest of all findings (Codex, cp7) | `chrome-qa/retest/REPORT.md` |
| Automated gates | earlier candidate `gate/full-20260929-2019/GATE.md`; targeted rerun `gate/rerun-20260929-2012/`; closeout smokes `closeout/`; final candidate `gate/final-cp10/GATE.md` |
| Key exposure remediation | `BUGS.md` DV2-02, `dv2-02/` |
| Sonnet 5.5 code review | `SONNET-REVIEW.md` |

## 10. Final closeout on checkpoint 12

Candidate `596c47066c07c2ce88df4b0eea928280de5a8063`. The execution inputs match the frozen checkpoint (`gate/final-cp10/resume-identity.json`). Final cumulative gate PASS: Chromium 109/109, Firefox Linux 45/45, WebKit Linux 45/45; unit 388/388, contract 465/465, integration 460/460; lint, typecheck and evidence scan pass. See `gate/final-cp10/GATE.md` for every BUILD_ID and the exact scope.

M01/M02 are fixed and retested: Add node returns keyboard focus; Copilot retains request/proposal/diff/removal confirmation while hidden; nested controls consume Escape first; refetch does not move focus; non-modal panels return focus to launchers. The dedicated keyboard spec passed 17/17 per browser (the Chromium targeted run additionally passed 3/3 admin tests) on cp12, including Firefox and WebKit through Linux Playwright. Q05 and F01 also passed the cp12 headed Chrome retest.

`chrome-qa/final-cp10/REPORT.md` reconciles all ten journeys: nine PASS and one NOT RUN for the literal exhaustive every-dialog sweep. Targeted keyboard checks, the phone sheet and representative modal focus behavior passed. The admin-inclusive A-retest has 36/36 checks, and resumed Session B has 26/26. Headed installed Chrome was driven through Playwright, not desktop computer use or human UAT. No live integration, real payment or production acceptance is implied.

Remaining P3 findings: Q01a raw provider/rare-code translations; Q04a landing focus order; R01 tooltip tap state after drag-off; R02 keyboard access to disabled-tab reasons; R03 fallback when a dialog opener is removed; R04 multi-approval display association. The existing amber/orange distinction and System-theme first-hydration limitations also remain. U1-U3 remain owner design decisions.

DV2-02 is verified for this worktree by the retained 10/10 crypto checks and zero old-key DB envelopes, not by redaction alone. The other two test environments remain OPEN for the owner. Historical verification evidence is identified as such; this closeout does not read or rotate those env files.

## Owner-authorized broader scenarios (2026-09-30)

The owner explicitly requested useful scenarios for wider audiences after the landing-copy task. Added twelve local scenarios (fifteen local templates total), preserving all six connected templates and their real prerequisites. Six curated landing examples and three goal-aware onboarding choices plus blank keep the first visit manageable; the full gallery remains available. Sample inputs/results are described in EN/AR and runs save real results without external sends. Personal and Operations categories are intentional. Existing order-totals copy now matches its actual graph; existing result keys/IDs remain compatible. Reviewed new scenario issues and R01/R02/R04 fixes are documented in BUGS.md; no deployment/spending/invitation scope was expanded.

Claude Opus5.5 helper reached its55-turn boundary without final completion; its output was preserved and completed/reviewed by primary executor. Astra supplied bounded independent read-only findings, not final acceptance. Helper transcripts remain under ignored helper-logs and are not commit evidence. CLI estimated usage cost is not proof of incremental billing; no new billing/credit activation or product-provider calls occurred.
