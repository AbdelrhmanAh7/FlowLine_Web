# Kimi — Flowline design v2: colorful palette, light theme, motion on every action

You are the **design lead and implementer** for this owner-approved visual update. The owner chose you because they
trust your design sense, so make it look genuinely great.

- Work ONLY in this directory: the git worktree `FL-wt-design`, branch `design-v2`, based on phase-4 `1a9883f`.
- Do NOT commit; the lead (Claude) reviews and commits.
- Do not touch other directories, the `phase-4` branch, staging on port 3200, or Docker containers.
- Do not edit this brief.

**Setup:**
- Run `CI=true pnpm install --frozen-lockfile --prefer-offline`.
- `.env.test` points at the worktree's own DB, `flowline_test_design` (created, empty). Migrate it with the project's
  test migrate script (see `package.json`).

**Read first:**
- `AGENTS.md`.
- `design-reference/DESIGN-REFERENCE.md` and the slides in `design-reference/slides/`.
- The Next.js 16 docs in `node_modules/next/dist/docs/` before touching layout, metadata or cookies. This Next.js
  version has breaking changes.

**Baseline:** "before" screenshots of the current design are in `artifacts/design-v2/screenshots/before/`, captured with
`e2e/tools/design-screenshots.mjs`. Reuse or extend that script for the "after" shots.

## FIRST: build a DESIGN SYSTEM, not ad-hoc styling
The owner said it plainly: **"I need a design system, not a spaghetti system."** Colors and motion must come from one
documented system that every screen uses. Do not sprinkle new classes and colors across pages.

1. **Token layers** in `src/app/globals.css`:
   - **Primitives:** color scales per hue (e.g. `violet-50…950`, `sky-…`, `emerald-…`, `amber-…`, `rose-…`,
     `orange-…`, neutrals). Plus spacing, radius, font sizes, shadows, and motion (`--dur-fast/base/slow`,
     `--ease-standard/emphasized/exit`).
   - **Semantic tokens,** redefined per theme under `[data-theme=light]` / `[data-theme=dark]`: `bg/surface/card/
     elevated`, `text-hi/med/muted`, `line`, `accent`, `on-accent`, `success/warning/danger/info` (each with `bg`, `fg`
     and `border` variants), and the category hues (`cat-trigger`, `cat-logic`, `cat-ai`, `cat-app`, `cat-output`).
   - **Components and screens use only semantic tokens.** Never a primitive, never raw hex. Add a lint check or unit
     test that fails on hex colors or primitive-scale classes in `src/components/**` and `src/app/**` (outside
     `globals.css`).
2. **Component library,** extending `src/components/ui.tsx` or splitting it into `src/components/ui/*`:
   - **Components:** Button, IconButton, Badge/StatusBadge, Card, Input/Textarea/Select, Tabs, Dialog, Drawer, Menu,
     Toast, Tooltip, Skeleton, EmptyState, and a category chip.
   - **Typed variants** (`variant`, `tone`, `size`) that map to semantic tokens.
   - **Motion built in:** open/close, press, confirm-success and list-enter live inside the components as reusable
     primitives (`@keyframes` + utility classes named after their purpose, e.g. `motion-enter`, `motion-confirm`,
     `motion-running`, `motion-shake`), all honouring reduced motion.
   - Screens get motion by using these components and primitives, not by hand-writing animations.
   - Refactor existing screens to use the components where they currently hand-roll styles. The refactor must be
     behaviour-preserving.
3. **A living style guide page**, internal: `/design-system`, available in development and on the test stack. In a
   production build it returns 404 unless `FLOWLINE_ENV=test`, like the other test-only routes.
   - It shows every token, including swatches with contrast ratios, and every component, variant and motion primitive.
   - It covers both themes and both directions (Arabic RTL and English).
   - Take screenshots of it for the after set.
4. **Documentation:** `docs/design-system/README.md` covering principles, the token table (primitive → semantic, per
   theme), components with their props and variants, the motion rules (durations, easings, when to use each primitive,
   reduced-motion behaviour), color-usage rules (which hue means what), and do/don't examples.

Everything below (palette, light theme, motion on every action) must be implemented **through** this system.

## Libraries and future desktop/mobile apps (owner: "use Tailwind and all possible libraries, and make it easy when I ask for a desktop or mobile app")
Use a curated, proven stack, not every library that exists. Pin exact versions, and install with `pnpm add` so the
lockfile is updated. Every library must be MIT/ISC/Apache.

- **Tailwind CSS v4** (already installed) for all styling.
- **`class-variance-authority` + `tailwind-merge` + `clsx`:** typed component variants and a `cn()` helper (the
  shadcn/ui pattern).
- **Radix UI primitives:** `@radix-ui/react-dialog`, `-dropdown-menu`, `-popover`, `-tooltip`, `-tabs`, `-select`,
  `-direction`. They give accessible behaviour (focus trap, keyboard, ARIA); our tokens do all the styling. Use Radix's
  `DirectionProvider` so RTL works. Build the component library the shadcn way (components owned in our repo) on top of
  them.
- **`motion`** (motion.dev, the successor to framer-motion): app animations (`AnimatePresence` for enter/exit, layout
  animations for lists) and the scroll-linked public pages (`useScroll`, `useTransform`, `useSpring`). Use
  `MotionConfig reducedMotion="user"`.
- **`lenis`:** smooth scrolling, on the PUBLIC pages only (never inside the app, the canvas or scroll containers).
- **`lucide-react`:** one consistent icon set, replacing today's unicode glyph icons across the system.
- **Tokens are platform-neutral:**
  - The single source of truth is `src/design/tokens.ts`: primitive scales, semantic tokens per theme, radius,
    spacing, typography and motion (durations + easing curves).
  - A script, `pnpm tokens`, generates (a) the CSS variables block used by `globals.css`/Tailwind and
    (b) `src/design/tokens.json` in W3C Design Tokens (DTCG) format, for a future **desktop app** (Tauri/Electron,
    which reuses this web UI as-is) and **mobile app** (React Native + NativeWind, which reuses the same Tailwind theme
    names).
  - A unit test fails if the generated files are out of date.
  - Keep semantic token and Tailwind theme names framework-neutral (e.g. `bg-surface`, `text-hi`, `cat-ai`), and keep
    motion values as data (ms + cubic-bezier), so another platform can map them 1:1.
  - Document this in `docs/design-system/README.md` § "Other platforms".
- Record each library (name, pinned version, license, why) in `artifacts/design-v2/NOTES.md`.

## Public pages: Apple-style scroll motion (owner: "landing, welcome and public pages moving with you like Apple")
Covers the landing page (`/`), the welcome/onboarding intro, and other public pages (sign-in/up get a lighter version).
They are scroll-driven storytelling where the page responds to your scroll:

- **Hero:** a pinned (sticky) hero where the product visual (a real Flowline canvas/flow illustration built from our
  own components or SVG, not a fake screenshot with fake numbers) scales, tilts and settles as you scroll.
- **Sections:** they reveal as they enter (fade + rise + slight scale); the headline text reveals word by word.
- **A flow drawing itself:** nodes appear and edges draw along the scroll progress, and a "run" lights the steps one by
  one as you scroll past.
- **Depth:** parallax layers for the gradient backgrounds using the new palette.
- **Scroll-scrubbed feature sections:** Copilot → Agents → Knowledge → Integrations, each a pinned scene that changes
  as you scroll, with a progress indicator.
- **Smooth scrolling** with Lenis, and gentle magnetic/press feedback on CTAs.

Rules:
- Animate **only transform and opacity**, for 60 fps with no layout shift. Prefer CSS scroll-driven animations
  (`animation-timeline: view()/scroll()`) where supported, and fall back to `motion` `useScroll`.
- **Mobile:** lighter effects, no heavy pinning on small screens, works with touch.
- **Arabic RTL:** directions mirror, and the Arabic copy reads naturally.
- **Reduced motion:** everything becomes static, fully readable content.
- Scroll-linked motion is exempt from the 300 ms rule because it follows the scroll, but time-based UI transitions keep
  the ≤300 ms rule.
- **Honesty:** no fake metrics, customer logos, testimonials, pricing or claims. Only real features, and integrations
  marked with their real status (7 not verified live).
- **Performance:** LCP content must not wait for animation, the page stays usable without JS, and add no heavy video.
  Report a Lighthouse performance score for `/` (mobile + desktop) in `NOTES.md`.
- Add an E2E spec: the landing page scrolls through every section with no console errors; with reduced motion there are
  no transforms or animations on the scroll scenes; RTL has no horizontal scroll at 375/1024/1440.

## Owner decisions
These override the AGENTS.md "no light mode" rule and the Phase 4 "do not redesign" rule, for this branch only.

1. **Color refresh, not a redesign.** Keep the layout, spacing, components and information architecture. Replace the
   mostly monochrome palette with a vivid, cohesive multi-color system: one primary accent plus a small set of named
   hues (for example violet, sky, emerald, amber, rose, orange).
   - Use color with meaning:
     - canvas node categories (triggers, logic, AI, apps and output each get a hue);
     - run and step status;
     - integration and template categories;
     - badges, usage bars, focus rings and the brand gradient.
   - Keep it tasteful and readable, not rainbow noise.
   - All colors are tokens in `src/app/globals.css` `@theme`, with no hard-coded hex in components. Replace existing
     hard-coded gradients such as `#7c6cff` / `#38bdf8` in `app-shell` and `ui` with tokens.
2. **Add a light, colorful theme** next to the existing dark one. Dark stays the default.
   - Choices: Light / Dark / System, stored in a cookie `fl_theme` (like `fl_locale` in `src/i18n`).
   - Apply it on the server to `<html data-theme=…>` so there's **no flash** on load. System follows
     `prefers-color-scheme`.
   - Put the switch in the user menu next to the language switcher, and on the auth pages.
   - Every string in Arabic and English: `src/i18n/messages/ar.ts` is the source of truth, and `en.ts` has identical
     keys.
   - WCAG AA contrast in both themes: body, muted, text on accent buttons, status badges.
   - The React Flow canvas (edges, handles, minimap, background) must look right in both themes.
   - The product is Arabic-first (RTL) and must stay perfect in RTL.
3. **Clear feedback motion on every action.** The user must SEE each action happen.
   - **Canvas:**
     - node added: scale or fade in; node deleted: fade or scale out; duplicate;
     - connect: the edge draws in; selection: a pulse.
   - **While running:**
     - the running step glows or pulses in its hue;
     - edges show a flowing dash from the finished step to the next;
     - succeeded steps flash a tick; failed steps shake once and turn the danger color;
     - run-dock entries slide in.
   - **Confirmations:** save (saving → saved check), publish, approve/reject, create/revoke key, invite sent and copy to
     clipboard each get a short confirmation animation on the control itself.
   - **General UI:**
     - toasts slide or fade in and out;
     - dialogs, drawers, popovers and menus animate open and closed;
     - page and tab changes get a quick fade;
     - newly added list items (runs, flows, keys) animate in;
     - skeletons shimmer while loading;
     - buttons have a subtle press (scale down). **No hover lifts.**
   - UI transitions are **≤ 300 ms**. Running-state loops may keep looping while a run is in progress. Use CSS first
     (Tailwind v4 plus `@keyframes` tokens in `globals.css`); avoid adding a motion library unless clearly needed.
   - `prefers-reduced-motion: reduce` disables all non-essential motion. The running state is then shown statically,
     for example as a ring.
   - No layout shift. Motion is RTL-correct, so slide directions mirror in Arabic.
4. **Honesty rules still apply.** Animate only real, server-confirmed outcomes (the saved check appears only after the
   save succeeds). No fake success, metrics or claims.

## Tests and verification
- Existing tests stay green without weakening any assertion.
- If Playwright isn't already set to `reducedMotion: "reduce"`, set it for stability, and keep one `@cross-browser`
  spec that runs WITH motion.
- Add these tests:
  - a unit test for theme-cookie resolution;
  - an E2E spec where the Light/Dark/System switch persists across reload, `data-theme` is present in the server HTML,
    and it works in Arabic;
  - a reduced-motion spec: animations are off, e.g. the computed `animation-name` is `none` on the running node;
  - a spec showing a run's running → succeeded visual states.
- Gates, in this worktree, one heavy command at a time (the laptop has limited resources):
  1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:contract`, `pnpm test:integration`
  2. `pnpm test:e2e --project=chromium --project=firefox` (port 3100 is free; run `pnpm stop:test` afterwards)
- **"After" screenshots** at 1440 and 375, in Arabic and English, dark and light, of these screens: landing, sign-in,
  flows dashboard, canvas with a running flow, run inspector, integrations, settings. Save them to
  `artifacts/design-v2/screenshots/after/`.
- **Write `artifacts/design-v2/NOTES.md`** with:
  - the palette (token table: hex and intended use, per theme);
  - contrast checks;
  - the motion inventory (action → animation → duration → reduced-motion behaviour);
  - the files touched;
  - gate results with counts;
  - open design questions.

End by printing a short summary: what changed, gate results, and where the screenshots are.
