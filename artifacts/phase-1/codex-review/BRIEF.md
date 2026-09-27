# Codex — agent-driven exploratory test brief (Flowline Phase 1)

You are an **independent tester**. Do **NOT** modify any product code (anything outside
`artifacts/phase-1/codex-review/`). Do not commit. Test first, report findings; the lead
developer (Claude) fixes them and will ask you to retest.

## Target
- App URL: http://localhost:3100 (isolated TEST stack: `FLOWLINE_ENV=test`, DB `flowline_test`). It is already running — do not start/stop servers or Docker.
- Code revision: `edeb6a8` (git repo in the current directory).
- Design reference: `design-reference/slides/slide-01.png` … `slide-16.png` (rendered from `Flowline — Product UI Design.pptx`). Compare the **application area** inside each slide's mock frame, not the slide title/frame.
- Test accounts (test env only, not secret):
  - `codex-a@flowline-e2e.test` / `Codex-Test-Pass-1` (not onboarded yet)
  - `codex-b@flowline-e2e.test` / `Codex-Test-Pass-1` (not onboarded yet)
  - You may also create new accounts via the Sign-up UI (use `@flowline-e2e.test` emails).
- Test-only fault injection (only exists in the test env): `POST /api/test/faults` with JSON `{"kind":"save"|"load"|"run","count":N,"status":500}`, reset with `{"reset":true}`. Needs header `origin: http://localhost:3100`. Use it only to provoke save/load failures; everything else must be tested through the UI.

## How to test
Use a **real browser that you control** (your browser / computer-use tools if available; otherwise write and run Playwright scripts that click/type/drag like a user — `@playwright/test` 1.63 and Chromium are installed; put any scripts under `artifacts/phase-1/codex-review/scripts/`). Take screenshots as evidence into `artifacts/phase-1/codex-review/screenshots/`. Watch the browser console and network (4xx/5xx, errors). **Do not** substitute API calls or app-state injection for UI interaction (except the fault endpoint above). Only one browser session at a time.

Keep machine load modest: one browser, no parallel test runners.

## Acceptance areas to explore
1. Journey as a new user: Landing → Sign up → 3-step onboarding (also try **Skip setup**) → Dashboard → Builder → Run → Run inspector. Integrations, Templates, Settings.
2. Canvas: add nodes (palette click, drag from palette, `/` search), connect handles by dragging, invalid connections (self, loop, second input, into trigger, out of output), select, multi-select, duplicate (Ctrl/⌘+D), delete (Del/Backspace), undo/redo (Ctrl+Z / Ctrl+Shift+Z), zoom −/+/Fit, Ctrl+0, arrows nudge (12px, Shift 1px), Esc, drawer settings persist after reload, rename flow, autosave status (Unsaved → Saving → Saved).
3. Keyboard safety: Delete/Backspace and Ctrl+Enter must NOT act while typing in inputs/textareas.
4. Execution: Manual trigger → JSON transform → Condition → Output; run; step states; inspector Input/Output/Error tabs; failed run (e.g. transform `$number("x")`); **Re-run from this step**; filters/search/Clear filters.
5. States: loading skeletons (no full-screen spinner), empty states, error states with Retry (use fault injection `load`), save failure (`save` faults: "Failed to save — retrying", then manual Retry), offline (DevTools offline / browser offline): banner, run disabled, local draft, reconnect saves; conflict when the server copy changed meanwhile.
6. Tenancy: account A must not see or open account B's flows/runs by URL.
7. Every button either works or clearly explains why it is disabled (hover/focus tooltip). No fake success, no fake metrics/usage.
8. Responsive: 1440, 1024, 375 and boundaries 767/768/1279/1280. Mobile (<768) = monitor only: editing disabled with banner, can still run and view results; no horizontal page scroll.
9. Focus-visible rings, reduced motion (emulate `prefers-reduced-motion`), no hover lifts.
10. Visual fidelity vs design tokens: app bg #09090B, surface #111113, card #18181B, elevated #27272A, accent #7C6CFF, Inter UI, JetBrains Mono data, 240px sidebar, 360px drawer.

## Report (write `artifacts/phase-1/codex-review/REPORT.md`)
- Environment actually used (browser tool / Playwright, versions), what you tested, counts.
- Findings table: ID, severity (blocker/major/minor/cosmetic), area, steps to reproduce, expected vs actual, evidence (screenshot path / console text).
- Things that worked (brief).
- Anything you could not test and why.
Call this an **agent-driven exploratory test** (not human testing).
