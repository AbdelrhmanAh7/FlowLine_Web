# design-v2 review (read-only) - Sonnet 5.5 (claude-sonnet-5-5)

Tree reviewed: `C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-design`, branch `design-v2`, HEAD `fb563e5`
plus Kimi's uncommitted work (39 modified files + 9 untracked). I also read the committed checkpoint `cbd8563`
(`git diff phase-4`) where the E2E-visible changes live (Button, Tabs, Menu, builder toolbar, auth header).

Checks run: `pnpm -s typecheck` = exit 0, no output. `pnpm -s lint` = exit 0, no output (both re-run at the end).
`vitest --project unit` on `i18n.test.ts`, `design-system.test.ts`, `secret-input-refs.test.ts` = 32/32 pass.
Nothing else executed: no browsers, no E2E, no DB. For E2E I used the lead's own live log
`artifacts/design-v2/gate/e2e-chromium.txt` + `test-results/*/error-context.md` (77 of ~85 Chromium tests were done
when I read it) and cross-checked my static predictions against it.

Two things changed in the tree while I reviewed (so treat those findings as "already being handled"):
`src/components/ui/button.tsx` (aria-describedby added) and `e2e/reduced-motion.spec.ts` / `e2e/run-states.spec.ts`
(assertions patched). I comment on those below.

## Ranking

- P0 = gate is red, or an honesty/a11y invariant regressed.
- P1 = user-visible regression or a brief requirement not met.
- P2 = correctness/quality issue with limited blast radius.
- P3 = polish / hygiene.

## Confirmed E2E failures so far (Chromium, from the lead's log) and root causes

| # | Test | Root cause | Finding |
|---|------|-----------|---------|
| 12 | arabic.spec.ts:144 (`/sign-in @375`, received 415 > 375) | ThemeSwitcher added to auth header | P0-2 |
| 24 | failures.spec.ts:8 (line 19 `toHaveAccessibleDescription` got "") | Button lost aria-describedby | P0-1 |
| 39 | library.spec.ts:25 (lines 31, 37) | same | P0-1 |
| 45 | phase3.spec.ts:42 (line 74) | same | P0-1 |
| 55 | phase3.spec.ts:346 (line 381) | same | P0-1 |
| 49, 50 | phase3.spec.ts:206, :222 (60 s timeout at line 172) | Copilot button name lost the glyph | P0-3 |
| 53 | phase3.spec.ts:274 (line 283) | same | P0-3 |
| 69 | responsive.spec.ts:230 (300 s timeout at line 280) | same | P0-3 |
| 58 | reduced-motion.spec.ts (expected "0.001ms", got "1e-06s") | wrong assertion in new spec | P0-4 (patched) |
| 70 | run-states.spec.ts:13 (`toBeVisible` on a zero-height SVG edge) | wrong assertion in new spec | P0-4 (patched) |

All 11 failures trace to 5 root causes. No existing assertion was weakened by Kimi (see section 2).

---

## P0

### P0-1 Button `disabledReason` no longer exposes its reason as the accessible description
- Old `ui.tsx` Button (phase-4) rendered `aria-describedby={reasonId}` + an always-in-DOM `role="tooltip"` span.
- New checkpoint `src/components/ui/button.tsx` (pre-fix lines 60-80) dropped it and wrapped the button in a Radix
  `Tooltip` whose `aria-describedby` goes on the wrapper `<span>` and only while open (`tooltip.tsx:11-24`).
- Result: `getByRole('button',{name:'Create invite link'})` -> description `""` (error-context of library.spec.ts:25).
  Breaks AGENTS.md "disabled control with a reason". 4 failing tests (table above), and every `disabledReason` button
  in the app (Run, Approve, Propose, Save, Create key...).
- Second problem, not in E2E: Radix Tooltip does not open on touch (focus that follows a pointerdown is ignored;
  touch pointermove ignored), so on phones the reason is unreachable. The old `group-focus-within` version showed it on tap.
- Working-tree fix already applied (button.tsx:54-79): `useId` + `aria-describedby` + `<span id className="sr-only">`.
  Nit: the span is INSIDE the `<button>`, so name-from-content makes the accessible name "Approve Only workspace owners
  and editors ...". Screen readers read the reason twice, `exact: true` name locators on disabled buttons break.
  Fix: render the sr-only span as a SIBLING inside the wrapper span:
  ```tsx
  if (!disabledReason) return btn;
  return (
    <Tooltip content={disabledReason} side={tooltipSide}>
      <span className="inline-flex">{btn}<span id={reasonId} className="sr-only">{disabledReason}</span></span>
    </Tooltip>
  );
  ```
  and add a touch path (e.g. `title={disabledReason}` on the button, or open the tooltip on click when `blocked`).

### P0-2 Auth and onboarding headers overflow horizontally at 375 px
- `src/app/(auth)/auth-form.tsx:131-134`: `<ThemeSwitcher/>` (3 icon+label buttons) and `<LanguageSwitcher/>` in a
  non-wrapping `flex` inside `max-w-[400px]`. Measured by the failing test: scrollWidth 415 vs 375.
  Same pattern `src/app/onboarding/wizard.tsx:80` (Logo + Theme + Language + Skip; not covered by any 375 test, will overflow too).
- The landing header already hides it on phones (`page.tsx:58`, `hidden sm:flex`) - the brief wants it on the auth pages though.
- Fix: give `ThemeSwitcher` a compact variant (icon-only below `sm`, label via `title` + `sr-only`, ~84 px total) and add
  `flex-wrap`/`min-w-0` on the header row; use it in auth-form and wizard. Re-run arabic.spec.ts:144.

### P0-3 Builder "Copilot" button lost the glyph, so its accessible name changed
- `src/components/builder/builder.tsx:753`: `<Sparkles aria-hidden/> Copilot` (was text `✦ Copilot`). Name is now "Copilot".
- Specs that use the old name: `e2e/phase3.spec.ts:172` (openCopilot, used by 3 tests), `:283` (aria-disabled), `e2e/responsive.spec.ts:280`
  (a 300 s timeout that stalls the whole gate). Also the dialog title (`copilot-panel.tsx:76`) still says `✦ Copilot`.
- Decision for the lead: the icon swap is owner-approved, so updating the locators to
  `getByRole("button", { name: "Copilot", exact: true })` at those 3 lines is legitimate (it is a renamed control, not a
  weakened assertion). Alternative: keep a `✦` text node in the name. Record it in NOTES.md as "E2E-visible change".

### P0-4 Two new specs asserted the wrong thing (already patched in the working tree - verify)
- `reduced-motion.spec.ts`: browsers serialise computed `transition-duration` in seconds (`"1e-06s"`), so `toBe("0.001ms")` could never pass.
  Patched to parse to ms (lines 21-23). OK.
- `run-states.spec.ts`: `toBeVisible()` on a straight horizontal SVG path (zero-height box) is always "hidden". Patched to `toBeAttached()` (line 25). OK.
  The `.flowing` class did appear in the failing run, which is a good sign for the feature itself.

---

## P1

### P1-1 Run inspector: the disabled "Error" tab lost its reason, dimming and aria state (item 4 of the brief)
Old (`fb563e5:src/app/w/[slug]/runs/inspector.tsx:420-441`) vs new (`inspector.tsx:421-436` + `ui/tabs.tsx:28-40`):

| Aspect (step did not fail) | Old | New (Radix `Tabs`) |
|---|---|---|
| ARIA | `aria-disabled="true"`, `aria-selected` | native `disabled` + `data-disabled` (no `aria-disabled`) |
| Title / reason | `title={t("runs.panel.didntFail")}` | none. `runs.panel.didntFail` is now an orphan key (en.ts:1426, ar.ts:1553) |
| Focus | `tabIndex=-1` unless selected (not in tab order, not arrow-reachable) | Radix roving focus skips it (same result) |
| Keyboard | custom: arrows follow reading dir, Home/End, skip disabled, focus follows selection | Radix: same behaviour (dir from `DirectionProvider`). OK |
| Click | no-op, tooltip on hover | dead native-disabled button, no tooltip |
| Visual | `cursor-not-allowed text-muted/60` (dimmed) | no disabled style: looks identical to a live tab |
| Layout | `gap-4`, `h-9`, no padding | `gap-5`, `h-10`, `px-5` inside the panel's own `p-5` (`inspector.tsx:374`) = doubled side inset |
| Panel | one `div role=tabpanel` | `Tabs.Content` per id, `tabIndex=0` (one extra tab stop) |

This is the "disabled control with a reason" rule broken again. Fix in `ui/tabs.tsx`: add `disabledReason?: string` to the tab item;
when set render `title={reason}`, an `sr-only` span with the reason inside the trigger (name stays "Error ..." so `getByRole("tab",{name:"Error"})`
still matches), and `data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60`. Pass `disabledReason: t("runs.panel.didntFail")` from
`inspector.tsx:432`. Drop `px-5` from the shared list (let the caller pass `listClassName`) so the step panel is not double-padded.

### P1-2 Platform-admin setup: the two TOTP inputs are now unstyled
`src/app/admin/setup/setup-flow.tsx:26` trimmed `codeClass` to `"h-9 w-32 font-mono tracking-widest"` (border/background/focus removed because
`Input` supplies them), but lines 232 and 259 still apply it to RAW `<input>` elements. With Tailwind preflight they render with no border
and no background, so the step-up/enrol code fields are invisible boxes (light and dark). Not caught by E2E (admin-panel.spec.ts fills by label).
Fix: replace both `<input ... className={codeClass}>` by `<Input ... className={codeClass}>` (same as `admin/panel.tsx:190`); `Input` forwards `ref`,
so `takeSecret`/`ref.current.value` reads keep working. (No secret invariant changes: these are one-time codes, not `SecretInput`.)

### P1-3 Every native `<Select>` lost its dropdown arrow
`src/components/ui/fields.tsx:75` uses `appearance-none` and nothing draws a chevron (old `selectCls` kept the native arrow). About 25 selects
(settings, agent form, node config, model picker, admin) now look like text inputs. Not an E2E failure, easy to miss in review.
Fix: wrap in `<div className="relative">` and add `<ChevronDown aria-hidden className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 text-muted"/>`
with `pe-8` on the select (logical properties, RTL-correct), or drop `appearance-none`.

### P1-4 Reduced motion is NOT "everything static and readable" on the public pages
- `globals.css:229,232`: `.reveal[data-reveal="hidden"]` / `.word-reveal[data-reveal="hidden"] > span` set `opacity:0`. `Reveal`/`WordReveal`
  (`landing/reveal.tsx:16, 43`) always hide then wait for the IntersectionObserver, and never check the media query. The reduced-motion block
  (`globals.css:264-272`) only zeroes durations. Result: with reduced motion, any section not currently in the viewport is invisible (Ctrl+F,
  print, full-page screenshot, AT users of reduced motion). The comment in `reveal.tsx:9` claims the opposite.
  Fix: in both effects `if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;` (imperative, no hydration risk), and/or in CSS
  `@media (prefers-reduced-motion: reduce){ .reveal[data-reveal="hidden"], .word-reveal[data-reveal="hidden"] > span { opacity:1 !important; transform:none !important } }`.
  Also `transition-delay` is not zeroed by the global rule.
- `globals.css:238-242`: the `170vh` pin wrapper and `position: sticky` apply unconditionally at >=1024 px, but the scrub animation exists only under
  `@supports (animation-timeline: view())` AND `no-preference`. Reduced-motion users and browsers without scroll timelines get 70vh of dead scroll with
  nothing changing. Fix: move `height:170vh` and the sticky rule into the same `@supports ... and (prefers-reduced-motion: no-preference)` block.
- `landing.spec.ts:46` "reduced motion: scroll scenes are static" checks the `role=img` child, but the transform lives on its parent `.hero-scrub`
  (`hero-pin.tsx:12`), so it cannot fail. Assert on `.hero-scrub` and on `.reveal` opacity after scrolling.

### P1-5 WCAG AA fails for tinted badges (light theme; one dark case); the test only checks bare surfaces
`Badge`/`CategoryChip` (`ui/badge.tsx:52-59, 91-97`) put `text-<hue>` on `bg-<hue>-bg` (12% tint) at 11 px. Computed with `src/design/contrast.ts` over the
card surface: light warning 4.10, cat-trigger 4.10, cat-logic 4.18, accent 4.07, success 4.43, cat-output 4.43 (<4.5); dark accent 4.01 (over elevated 3.36).
Over `bg`: light warning 3.91, accent 3.88. `tests/unit/design-system.test.ts:92-108` only checks fg vs `bg/card/surface`, so it passes.
Fix: (a) extend the test with a `mix(fg, surface, 0.12)` helper for every status/category/accent pair (script I used is in the report footer);
(b) in light theme pick a darker fg for badge text (add an 800 stop for amber/orange/emerald/brand and map `warning`, `cat-trigger`, `cat-logic`, `success`,
`cat-output`, `accent` badge text to it) or lower the tint to ~6%; (c) in dark, use `accent-hover` for accent-on-tint text.

### P1-6 The token guard has holes (item 1 of the brief)
`design-system.test.ts:16-22` catches hex and 8 primitive families only. It does NOT catch, and the code currently contains:
- `bg-black/60` x4: `integrations/page.tsx:308`, `runs/inspector.tsx:311,611`, `settings/ai-providers.tsx:619` (should be `bg-scrim`).
- primitive variables in style props: `landing/parallax-gradients.tsx:11,15,19` (`var(--color-brand-500|sky-500|emerald-500)`); use `var(--accent)`, `var(--info)`, `var(--success)`.
- Anything from Tailwind's default palette (`bg-red-500`, `text-white`, `slate/gray/zinc/green/blue/...`) still compiles because `@theme` does not reset defaults.
- `rgb()/hsl()/oklch()` and named colours; `.css` files; and `globals.css` is excluded wholesale, so its hand-written layer is unchecked.
Fix: add to the test
```ts
const NAMED = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:white|black|slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|neutral|brand)(?:-\d{2,3})?(?:\/\d+)?\b/;
const FN = /\b(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch)\(/;
const PRIM_VAR = /var\(--color-(?:neutral|brand|violet|sky|emerald|amber|rose|orange)-\d{2,3}\)/;
```
scan `globals.css` (minus the generated import) too, and put `--color-*: initial;` first in the generated `@theme` so non-token colours cannot compile.
Also fix the 4 + 3 existing offenders in the same change.

### P1-7 Four hand-rolled modals were not migrated; dead animation classes left behind
`integrations/page.tsx:308-309`, `runs/inspector.tsx:311-312` (`animate-sheet-in`) and `:611-612`, `settings/ai-providers.tsx:619-620`, plus `builder/copilot-panel.tsx:73`
and `builder/history-panel.tsx:63` use `animate-fade-in` / `animate-sheet-in`. Kimi removed those `--animate-*` tokens from `globals.css` (phase-4 had them, lines 56-60),
so these are now no-ops: no open animation, contradicting "dialogs, drawers ... animate open and closed". Only `publish-panel.tsx:109` uses the new `Dialog`;
the others still lack a focus trap (pre-existing) and use a raw black scrim.
Fix: move the three modals onto `ui/Dialog`/`Drawer` (keep `role=dialog` names; specs use `getByRole("dialog",{name})` at arabic.spec.ts:189,222,348),
and swap the two side panels to `motion-drawer`/`motion-pop`.

---

## P2

- **P2-1 Button `confirm` swaps the label for an svg** (`button.tsx:76`, 9 call sites: members.tsx:179,196, api-keys.tsx:120,173,188, oauth-apps.tsx:146, publish-panel.tsx:81,123,134, inspector.tsx:570,573).
  For 1.4 s the button has an EMPTY accessible name (the check is aria-hidden) and its width changes (layout shift; the brief says none).
  Fix: keep `children` in place with `opacity-0` (stays in the a11y tree and keeps the width) and overlay the check `absolute inset-0 flex items-center justify-center` (button gets `relative`).
  Also `api-keys.tsx:120`: the check is on the Revoke button of a row that the refetch then turns into a "revoked" row, so it is barely visible; put it on the Confirm button.
- **P2-2 ThemeSwitcher SSR shows "Dark" pressed for light/system users** (`theme/client.tsx:35` `getServerSnapshot = () => "dark"`, used by `theme-switcher.tsx:19` and the user menu `app-shell.tsx`). No hydration warning (uSES handles it) but the server HTML and first paint are wrong until hydration.
  Fix: pass the server-known `theme` from `layout.tsx` through a small context and use it as the server snapshot. Same for `useCanvasColors` (`client.tsx:66-72`, dark hexes for light users until hydration; brief flash of dark dots).
- **P2-3 ParallaxGradients probably invisible** (`landing/parallax-gradients.tsx:8` `fixed -z-10`, wrapper `page.tsx:45` `bg-surface`, `globals.css` `html, body{background}`): a negative-z layer in the root stacking context paints BELOW in-flow block backgrounds, so the wrapper/body backgrounds cover it. Unverified in a browser (no after screenshots yet). Fix: add `relative isolate` to `<div className="min-h-dvh bg-surface">`. Also swap the primitive vars (P1-6).
- **P2-4 Hero scrub likely runs only at pin release** (`globals.css:243-258`): `animation-timeline: view()` is on `.hero-scrub`, which is inside the sticky stage, so its view progress does not advance while pinned; the "scale/tilt while pinned" the owner asked for probably never shows. Unverified. Fix: `.hero-pin { view-timeline: --hero block }` and `.hero-scrub { animation-timeline: --hero; animation-range: contain 0% contain 100% }`.
- **P2-5 `motion-select-pulse` hides the running glow** (`globals.css:134-135` both set `animation`; the later rule wins; `flow-node.tsx` adds both classes when a running node is selected). Fix: pulse via a pseudo-element/outline, or order/compose (`animation: m-running ..., m-select-pulse ...` on `.motion-running.motion-select-pulse`).
- **P2-6 `MenuLink` renders `<a>`, not Next `Link`** (`ui/menu.tsx:75-79`, comment says client-side navigation): user-menu items "Resend verification" / "Delete account" now do full page loads. Use `<Link>` inside `RadixMenu.Item asChild`.
- **P2-7 `WordReveal` accessibility** (`landing/reveal.tsx:56-64` (`aria-label` at :59)): `aria-label` on a generic span plus `aria-hidden` word spans; generic elements are not reliably labelled by screen readers (Playwright's accname does use it, so tests pass). Safer: keep the words visible to AT and only animate. Latent RTL bug: per-word `inline-block` spans are atomic inlines, so a Latin multi-word phrase inside an Arabic title (e.g. "Google Sheets") would render reversed. Current Arabic titles have no Latin words (checked ar.ts:159,169,174,179-191,327,338), so it is latent.
- **P2-8 Test gaps for the new public pages**: `hydration.spec.ts:10` covers app routes only; add `/`, `/sign-in`, `/onboarding` in Arabic + light theme. `reduced-motion.spec.ts` leaves a 30 s stuck run behind (`helpers.ts` `resetFakeProvider` is never called): add `test.afterEach(() => resetFakeProvider(page.request))` and cancel the run.
- **P2-9 Process:** the responsive spec rewrote 57 tracked files under `artifacts/phase-3/screenshots/*.png` (git status). Run `git checkout -- artifacts/phase-3/screenshots` before committing so Phase 3 evidence is not overwritten.

## P3

- `package.json:38` `@radix-ui/react-select` is installed and unused (no import; `fields.tsx:83` says the native select is deliberate). Remove it (and the lockfile entry).
- `ui/feedback.tsx:48` `role="meter"` has no accessible name; add `aria-label`/`aria-labelledby` (billing-plan.tsx:249,256).
- `landing/feature-scenes.tsx:65` sr-only text inside an `aria-hidden` rail is never announced; `:89` the providers list is labelled with the section title, not "Integrations".
- Landing/hero illustration node subtitles are English-only literals (`page.tsx:36-40, 168-170`); everything else goes through i18n. Translate or mark them as machine text.
- `landing.featuresBody` says "Four real capabilities, working inside the product today" while Copilot is labelled beta in the app (`copilot.beta`); add a beta qualifier (honesty rule).
- `WordReveal` stagger (`--w-delay` 60 ms x index + 250 ms) exceeds 300 ms total for long titles; per-transition it is within the rule, mention it in NOTES.
- `scroll-root.tsx`: `lenis/dist/lenis.css` is not imported; verify the horizontally scrolling flow cards and `#anchor` links behave with Lenis. `useReducedMotion()` logs "You have Reduced Motion enabled" in dev (seen in the gate log at scroll-root.tsx:12); use a plain `matchMedia` check in the effect.
- `landing/flow-scene.tsx:46-51` passes a new `subscribe` function each render to `useSyncExternalStore` (resubscribes every render); hoist it.
- Light theme: `card`, `surface`, `elevated` are all `neutral-50`, and form-control borders (`line-strong` on card) are ~1.4:1; WCAG 1.4.11 asks 3:1 for input boundaries. Design decision for the owner; brief only mandated text AA.
- `theme/client.tsx:47` `useResolvedTheme` is unused. Some glyph icons remain (`⚠ ▾ ▸ ✓ ● ⬡ ⏸`, template chains use `NODE_DEFINITIONS[..].icon`); several are pinned by specs (`✓ المُحوِّل مُنفَّذ`, `▶ Run`), so leave those.
- Deliverables from the brief still missing: `artifacts/design-v2/NOTES.md` (only `NOTES-draft.md`, which also says `tests/unit/design-tokens.test.ts` - the file is `design-system.test.ts`), after-screenshots (the tool captures the first viewport only, `design-screenshots.mjs:136`), Lighthouse numbers, and the E2E-visible-changes list (use P0-1/P0-3, P1-1 above).

---

## Per-category answers

### 1. Design-system compliance
- No raw hex / rgb / hsl anywhere under `src/app/**` or `src/components/**` outside the token files (grep clean; `globals.css` hand layer has none either).
- No primitive-scale classes (guard passes). Violations the guard cannot see: P1-6 (`bg-black/60` x4, `var(--color-*-500)` x3).
- Guard exists (`tests/unit/design-system.test.ts`, plus fresh-generated-files test and theme-cookie test) but is too narrow: see P1-6 for the exact regexes.
- Tokens compile: `tokens.generated.css` is fresh (test passes). `/design-system` is gated in production by `process.env.NODE_ENV === "production" && FLOWLINE_ENV !== "test"`; the root layout reads cookies so the page is per-request. OK.

### 2. E2E breakage
- Table at the top. All are code-vs-spec mismatches from Kimi's icon/Tooltip/Tabs changes (P0-1, P0-2, P0-3), not weakened tests.
- Edits to `e2e/helpers.ts` (adds `FAKE_PROVIDER`, `setupStuckSheetsRun`, `resetFakeProvider` only), `playwright.config.ts` (adds `reducedMotion: "reduce"` only; `retries: 0` unchanged), `e2e/tools/design-screenshots.mjs` (adds 5 screens): no skips, no retries, no removed or loosened assertion, no existing spec edited (`git diff phase-4` shows only ai-hub-merge changes to specs, none from Kimi).
- Side effect to be aware of: global reduced motion means every pre-existing spec now runs without animation; only `run-states.spec.ts` (`@cross-browser`, `reducedMotion: "no-preference"`) exercises motion, as the brief asked.
- Likely still to fail once reached (same causes, not yet run when I read the log): `responsive.spec.ts:280`, `phase3.spec.ts:172/283` on Firefox/WebKit, and `arabic.spec.ts:144` on the other browsers.
- Checked and fine: all `data-testid`s, `getByRole` names for user menu (`menuitem`/`menuitemradio` via Radix), palette options, drawer tabs (arrow keys, End wrap), toasts, `▶ Run`, `Review →`, headings inside `WordReveal` (name comes from `aria-label`; `toContainText` uses textContent).

### 3. Security / honesty invariants
- `SecretInput` and `takeSecret` are byte-identical to before; all 5 usages keep `ref` (admin/panel.tsx:371, setup-flow.tsx:102,144,198, oauth-apps.tsx:142); `KeyInput` (ai-providers.tsx:637) and SSO secret (sso.tsx:123) untouched; still uncontrolled `type=password`, cleared by `takeSecret`, no echo. `Input`'s `useKeepEarlyInput` only acts on string `value` + `onChange`, so it does not touch secret fields.
- "test double" (`ai-providers.tsx:42-44`), "not live-verified" (`integrations/page.tsx:175-180`), unknown cost (`inspector.tsx:414`, `model-picker.tsx:98`) and unverified landing badges are still rendered.
- Platform-admin `lockReason` gating and the step-up card are unchanged apart from `<Input>`/`<Select>` swaps (`admin/panel.tsx:190, 465-515`).
- Regressions: `disabledReason` accessibility (P0-1) and the Error-tab reason (P1-1).

### 4. Run inspector tabs
See P1-1 (old vs new table, exact lines, fix).

### 5. Motion
- Durations: all time-based UI transitions are 80-300 ms (`tokens.generated.css` `--dur-*`, toast 0.2 s, reveal `--dur-max`). Loops (`m-running`, shimmer 1600 ms) are running/loading states only. No hover lifts found (grep for `hover:*translate|scale|shadow|-mt` empty).
- Reduced motion: global `animation:none !important; transition-duration:.001ms` works for the app and Radix Presence; `MotionConfig reducedMotion="user"`; Lenis is skipped under reduced motion and on coarse pointers (`scroll-root.tsx:12-14`). Gaps: P1-4 (hidden reveals, dead pin height), P3 (transition-delay, dev warning).
- Hydration: `Reveal`/`WordReveal` mutate `dataset` in effects (no markup difference); `FlowScene` uses `useSyncExternalStore` with a server snapshot; `Magnetic`/`ScrollRoot` only read `useReducedMotion` in handlers/effects; `HeroPin`/`ParallaxGradients` are server components. The only SSR/client divergence is the intentional theme snapshot (P2-2). The existing hydration monitor passed on the app routes (Chromium), but it does not cover the new public pages (P2-8).
- Canvas: delete waits 160 ms with a timer that undo/replace cancel (`builder.tsx`), enter flags clear at 250 ms; specs for delete/undo pass. `P2-5` for the running-glow conflict.

### 6. Arabic-first / RTL
- No physical `left/right/ml/mr/pl/pr/text-left` introduced. Remaining ones are deliberate: canvas node handles in an `LTR` canvas (`flow-node.tsx:154,165`) and the centred toast (`toast.tsx:39`).
- Radix gets direction from `DirectionProvider dir={dirOf(locale)}` (`providers.tsx`); keyframes use `--dir-sign`; shimmer mirrors. Arabic key parity is enforced by types + `i18n.test.ts` (passes). No new user-facing strings outside i18n except the English-only illustration subtitles (P3) and the brand name "Copilot".
- RTL breakages: P0-2 (auth header at 375 in Arabic) and the latent WordReveal bidi issue (P2-7).

### 7. Dependencies
Added: 7 Radix packages, `class-variance-authority` 0.7.1 (Apache-2.0), `clsx`, `tailwind-merge`, `lenis` 1.3.26, `lucide-react` 1.48.0 (ISC), `motion` 13.4.4; all MIT/ISC/Apache-2.0 (read from `node_modules/*/package.json`), all pinned exactly, lockfile has matching entries.
Used: everything except `@radix-ui/react-select` (P3). `motion` is used for the landing scroll hooks, Toast and `MotionConfig`; `lenis` only in `ScrollRoot`. Note the brief said to avoid a motion library unless needed for scroll; using it for Toast is a small overreach but it is justified by exit animation.

### 8. Typecheck / lint
`pnpm -s typecheck` exit 0; `pnpm -s lint` exit 0 with empty output, both at the start and again after the last edits. Unit tests for i18n / design-system / secret-input: 32 passed.

---

Contrast script used for P1-5 (scratch, not in the repo): for each theme and surface in {bg, card, surface, elevated} and each fg in
{success, warning, danger, info, accent, cat-*}, blend `fg` at 12% over the surface (`color-mix(in oklab)` approximated in sRGB, error < 0.05) and compute
`contrastRatio(fg, blended)` from `src/design/contrast.ts`.
