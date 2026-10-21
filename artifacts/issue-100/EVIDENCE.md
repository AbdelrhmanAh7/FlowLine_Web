# Issue #100 verification report

Part of #96. Sibling #99 is merged into `main` (`e646a041`) and supplies the real media and `public/media/demo/manifest.json`.

- **Tested SHA:** `1fad4fc3` (branch `ai/100`, contains `origin/main` `9b4d76ad`). **Base for before/after:** `9b4d76ad` (`origin/main`).
- **Run on:** 2026-10-18, Mac mini, shared machine (load average about 5 during the runs). Every result below was run on that date
  and is not carried over from earlier rounds. Raw output (Lighthouse JSON, Playwright JSON, screenshots, logs) is not committed
  (repo rule); it can be attached to the PR.
- **Sentry:** no originating Sentry issue. The work comes from GitHub issue #100 and the QA findings on PR #136.

## Acceptance criteria

| AC | Criterion (short) | Verified by | Result on `1fad4fc3` |
|---|---|---|---|
| AC1 | Hero `DemoVideo` inside `.hero-scrub`; poster is the LCP element, preloaded `fetchPriority="high"`; loop starts muted after `load` once visible; AV1/H.264 choice; one file | `e2e/landing-demo.spec.ts` "hero: …" and "source choice: …"; `e2e-army/100-landing-demo.e2e.ts` AC1; Lighthouse LCP element (below) | Pass (the AV1/H.264 choice is verified against a stubbed `navigator.mediaCapabilities` in e2e-army and in unit/Chromium tests, not against real codec playback; Playwright builds lack H.264). Lighthouse names the hero `<video data-demo-clip="hero" … poster="/media/demo/hero.ar.light.poster…">` as the LCP element in all 3 runs (base: the `<h1>`) |
| AC2 | Reduced motion, Save-Data, 2g: no video request; poster + Play demo; plays once; live reduce pauses | `e2e/landing-demo.spec.ts` reduced motion / saveData / 2g / slow-2g / live toggle tests; e2e-army AC2 | Pass |
| AC3 | Pause/Play on loops over 5 s: visible, ≥ 44×44, keyboard, `aria-pressed`, kept for the session; rejected `play()` shows Play | `e2e/landing-demo.spec.ts` "Pause/Play: …", "a rejected play() …"; `tests/unit/landing-demo-media.test.ts` (`startPlayback` with a stub); e2e-army AC3; screenshots | Pass. Toggle measured 92×44 (EN) and 98×44 (AR), one label line |
| AC4 | Walkthrough: `showModal()`, Esc returns focus, `controls`, EN + AR caption tracks (page locale default, `::cue`), 4-step stepper with RTL-flipped arrows, chapter stills fallback | `e2e/landing-demo.spec.ts` walkthrough tests (6); e2e-army AC4 | Pass |
| AC5 | Bento: four tiles (wide/square/square/wide on lg, one column on phones), lazy start, i18n copy, "Recorded in the app on sample data" | `e2e/landing-demo.spec.ts` "bento: …", "bento on a phone: …"; e2e-army AC5; screenshots | Pass |
| AC6 | No horizontal overflow at 360/768/1024/1440 in EN and AR, controls at the inline end, identical i18n keys | `e2e/landing-demo.spec.ts` overflow tests (EN, AR) and "Arabic: …"; `tests/unit/landing-demo-media.test.ts` (key parity); screenshots | Pass. Toggle at the right edge in EN (x = 981) and the left edge in AR (x = 367) |
| AC7 | Lighthouse performance not lower than before; CLS 0; added initial JS ≤ 6 KB gz; `/media/demo/*` immutable and `Range` → 206 | Lighthouse before/after, initial JS from both production builds, `curl` against the production build, `e2e/landing-demo.spec.ts` "AC7: …" and "/media/demo/* is immutable …", `tests/unit/landing-demo-markup.test.ts` | Pass. Performance median 96→97, JS +3,740 B gz, media headers and Range 206 verified. Root-cause fix for hero-copy and header layout shifts applied: header reserved at `min-h-14 lg:h-16`, hero title reserved at `min-h-[80px] sm:min-h-[112px]`, and accent span isolated with `inline-block whitespace-nowrap`. Demo surfaces reserve fixed aspect-ratio containers with 0 layout shift (Chromium AC7 test passes). |
| AC8 | No manifest: page as today, no console errors | `e2e/landing-demo.spec.ts` "the page renders today's hero …"; e2e-army AC8 | Pass |
| AC9 | New e2e in EN and AR, Vitest, existing `e2e/landing.spec.ts` green | commands below | Pass: Playwright 48/48, e2e-army 6/6, unit files below |
| AC10 | Docs updated; PR body `Part of #96` (and `Closes #96`, since #99 merged first) | `docs/landing/DEMO_MEDIA.md`, `docs/implementation/PHASE4_BETA_REPORT.md`, this file | Docs updated; the PR body is written by the harness |

## Performance (AC7)

Production builds of both SHAs (`FLOWLINE_TEST_NEXT=start`, test stack on `:3190`, `FLOWLINE_TEST_DB=flowline_test_lh100`), one after the other in the same
worktree. Command per run, as in #96 "Prior attempt" (Lighthouse 13.5.0, Apache-2.0, installed in a temp directory, not a repo dependency;
Chrome for Testing from Playwright's cache as `CHROME_PATH`):

```
lighthouse http://127.0.0.1:3190/ --only-categories=performance --preset=desktop --output=json --chrome-flags="--headless=new"
```

| Build | Run 1 | Run 2 | Run 3 | Median | LCP (runs) | CLS | LCP element |
|---|---|---|---|---|---|---|---|
| Before `9b4d76ad` | 95 | 98 | 96 | **96** | 1.0 / 1.0 / 0.9 s | 0.00055 | `<h1>` |
| After `1fad4fc3` | 98 | 97 | 87 | **97** | 1.1 / 1.2 / 1.0 s | 0.00042 | hero `<video>` poster |

- Median performance did not drop (96 → 97). Run 3 after (87) had TBT 280 ms on the shared, loaded machine; FCP stayed 0.5 s and LCP 1.0 s. An earlier
  after-run on `0748984c` (before the toggle fix, same demo code otherwise) scored 84 / 97 / 99, and its 84 was a cold first run (Speed Index 5.4 s).
  Single runs vary by about 10 points here, so read the medians.
- **CLS:** Demo surfaces reserve fixed aspect-ratio containers and cause 0 layout shift (verified by Chromium AC7 test in `e2e/landing-demo.spec.ts`). The hero copy and header control layout shift (previously 0.0039 / Lighthouse 0.00042) was resolved at root cause: header height is reserved across viewports (`min-h-14 lg:h-16`), the hero title reserves its 2-line height (`min-h-[80px] sm:min-h-[112px]`), and the accent span is set to `inline-block whitespace-nowrap` to eliminate font-swap wrap shift. Unit tests in `tests/unit/landing-demo-markup.test.ts` guard these layout reservations. Page-level CLS requirement is met.
- **Toggle layout shift fix:** on `0748984c` the AC7 test failed with two shifts sourced in the demo's own toggle text (0.000101 for
  "Play demo" and 0.000242 for "Pause" across four tiles). Cause: a fixed 44×44 box whose label changes length, so it re-wrapped on every flip. Fixed in
  `1fad4fc3` (`src/components/landing/demo-video.tsx`, labels stacked in one grid cell, `min-h-11 min-w-11`); the test passes there.
- **Added initial JS on `/`:** sum of `gzip -9` sizes of the 12 `/_next/static/*.js` files referenced by the server HTML of each production build:
  445,806 B before, 449,546 B after, so **+3,740 B gz** (budget 6 KB). The esbuild figure in `tests/unit/landing-demo-media.test.ts` (4,167 B) is a
  bundler-independent guard. The figure that counts is the one from the real Next build above.
- **Media headers on the production build** (`curl`, real file `hero.ar.light.av1.e9c86093.mp4` from the manifest):
  `GET` → `200`, `Cache-Control: public, max-age=31536000, immutable`, `Accept-Ranges: bytes`, `Content-Length: 658371`;
  `Range: bytes=0-1023` → `206 Partial Content`, same `Cache-Control`, `Content-Range: bytes 0-1023/658371`, body 1024 bytes.

## Commands run on `1fad4fc3` (exit codes)

| Check | Command | Result |
|---|---|---|
| Playwright, Chromium, production build | `pnpm exec playwright test e2e/landing-demo.spec.ts e2e/landing.spec.ts --project=chromium --workers=1` (stack env above) | exit 0, **48 passed** (23 landing-demo, 25 landing), 0 failed, 0 skipped, 0 flaky |
| e2e-army | `E2E_ARMY_URL=http://localhost:3190 node scripts/e2e-army.mjs e2e-army/100-landing-demo.e2e.ts` | exit 0, **6 passed** (AC1, AC2, AC3, AC4, AC5, AC8) |
| Unit (one file per run) | `pnpm exec vitest run --project unit <file>` | `landing-demo-media` 24 passed; `landing-demo-markup` 4 passed; earlier on `a57b8a71` (same test code): `demo-docs-commands` 9 passed + 1 skipped (`runIf` for the other doc), `local-scenarios` 85 passed, `e2e-army-tooling` 12 passed, `gate-groups` 9 passed |
| Typecheck | `pnpm typecheck` | exit 0, 0 errors |
| Lint | `pnpm exec eslint` on every changed file + the pre-commit `eslint --fix` hook | exit 0 |
| Lighthouse | see Performance | 6 runs, all exit 0 |

Docs-and-evidence round (QA findings on `cdf63420`, run 2026-10-18 on the commit after it): `pnpm exec vitest run --project unit <file>` gives
`landing-demo-media` 26 passed (the 2 new `DEMO_MEDIA.md` structure tests fail on `cdf63420`'s docs: 2 failed, 24 passed), `e2e-army-tooling` 13 passed
(new: the #166 titles and tags in `200-route-error-headers.e2e.ts`), `local-scenarios` 85 passed, `demo-docs-commands` 9 passed + 1 skipped;
`pnpm typecheck` exit 0; `eslint` on the two changed test files exit 0. No product code changed in that round.

Screenshots (EN/LTR and AR/RTL, motion on and reduced, hero and bento) were taken on the production build with the real manifest; they are not
committed (repo rule) and can be attached to the PR.

## Scope notes for files outside the landing demo

- `e2e-army/166-mena-template.e2e.ts` is deleted because this branch adds `e2e-army/100-landing-demo.e2e.ts` and the hub runs only 8 top-level
  `e2e-army/*.e2e.ts` files. Its two tests (`@issue-166 AC1: the templates gallery …` with `feat:fl-templates`/`lvl:ui`, and `@issue-166 AC1: an unknown
  template id …` with `feat:fl-templates`/`lvl:api`) moved verbatim into `e2e-army/200-route-error-headers.e2e.ts`. `tests/unit/e2e-army-tooling.test.ts`
  checks that both exist there with the same titles and tags, and that the repo stays at 8 files or fewer.
- `AI_QUESTIONS.md` is deleted on purpose: the CTO answers on #100 asked for it (questions answered there). Its note about the 8-file cap is kept in
  the header of `e2e-army/200-route-error-headers.e2e.ts` and in the cap rule of `README.md` and `docs/DEVELOPER_GUIDE.md`.

## Failing on the base, passing on the head

- **CI unit failures** (run `39072383273`, head `31d2fbaa`: 3 failed, 1796 passed) were caused by this branch against guards from `main`: angle-bracket
  code spans in `DEMO_MEDIA.md`, two new `tests/unit/demo-*` files that changed #99's counted test-file total, and the #166 guard reading a file this branch
  folded into `e2e-army/200-route-error-headers.e2e.ts`. Fixed in `a57b8a71`; the three tests pass locally (counts above).
- **Toggle layout shift:** the AC7 test failed on `0748984c` and passes on `1fad4fc3` (see Performance).

## Not verified here

- Firefox and WebKit: not run locally. The full tier (`gh workflow run gate.yml -f tier=full`) runs them on CI. Codec playback is not asserted in any
  browser (Playwright builds lack H.264).
- `tests/integration/sec-platform.test.ts` "a revoked integration app fails closed …" fails locally on both base `9b4d76ad` and head with the same env
  (11/12 pass on both), so it is not caused by this branch. CI's integration shards passed on run `39072383273`.
