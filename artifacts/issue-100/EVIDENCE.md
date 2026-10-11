# Issue 100: landing demo embed, how each acceptance item is verified

Part of #96. Tested tree: the commit that contains this file (`git log -1 --format=%H -- artifacts/issue-100/EVIDENCE.md`).

| AC | Verified by | Status |
|---|---|---|
| 1 hero inside `.hero-scrub`, preloaded poster, loop after load, AV1 vs H.264, one file | `e2e/landing-demo.spec.ts` (hero, source choice), `e2e-army/100-landing-demo.e2e.ts` AC1, `tests/unit/demo-media.test.ts` (`chooseSource`), `tests/unit/demo-markup.test.ts` | unit + markup tests run locally and pass; browser specs run on CI |
| 2 reduce / saveData / 2g: no video request, Play demo, plays once, live toggle | `e2e/landing-demo.spec.ts` (reduced motion, saveData, 2g, slow-2g, live toggle), `shouldSkipVideo` unit test | browser specs run on CI |
| 3 Pause/Play >= 44x44, `aria-pressed`, keyboard, session; rejected `play()` | `e2e/landing-demo.spec.ts` (Pause/Play, rejected play), `startPlayback` unit test with a stub | unit run locally; browser on CI |
| 4 walkthrough: `showModal`, Esc + focus, controls, EN/AR tracks, stepper, RTL-flipped keys, stills (reduced motion or no playable video) | `e2e/landing-demo.spec.ts` (4 walkthrough tests, incl. the media-error stills fallback), `e2e-army` AC4 (also Arabic copy and `::cue` styles), markup test | browser specs run on CI |
| 5 bento: four tiles, spans, lazy start, copy, note | `e2e/landing-demo.spec.ts` (bento, phone), `e2e-army` AC5 | browser specs run on CI |
| 6 RTL/EN no overflow 360/768/1024/1440, inline-end controls, identical i18n keys | `e2e/landing-demo.spec.ts` (overflow loop), `tests/unit/demo-media.test.ts` (keys) and the `Messages` type (ar is the source of truth) | keys: local; overflow: CI |
| 7 Lighthouse, CLS 0, <= 6 KB gz JS, headers + Range | CLS: fixed `aspect-ratio` box (markup test). Headers: `tests/unit/demo-media.test.ts`. Range 206: `e2e/landing-demo.spec.ts` "served media" (skips until #99's media is in the tree). JS size: esbuild estimate below. Lighthouse needs a production build | JS estimate about 3.2 KB gz; Lighthouse **not measured here** (see below) |
| 8 no manifest: page unchanged, no console errors | `e2e/landing-demo.spec.ts` "without a manifest", `readDemoManifest` unit test | CI |
| 9 tests green | `pnpm lint`, `pnpm typecheck`, the unit files above: green locally | full suite runs on CI (owner rule) |
| 10 docs | `docs/landing/DEMO_MEDIA.md`, `docs/DEVELOPER_GUIDE.md`, `docs/README.md` | done |

## Not run locally, and why

- The Playwright and e2e-army specs need Postgres and a local port; the implementer sandbox blocks both (`connect EPERM 127.0.0.1:5432`).
  They are written against the final markup and run on CI.
- No production build here (owner rule: the full suite and build run on GitHub-hosted CI). Lighthouse before/after numbers and the
  gzip size of the added client JS (`demo-video`, `demo-walkthrough`, `demo-source`) must be taken from the CI build; the command is in
  #96 "Prior attempt".

## Re-check on `0578080` (2026-10-11, after merging `origin/main` at `aee8385`)

Run in the implementer worktree on `05780806d195de5f5677d729b14d3d7719610055`:

- `pnpm typecheck`: no errors.
- `pnpm exec eslint` on every file this branch changes under `src/`, `e2e/`, `e2e-army/`, `tests/unit/`, plus `next.config.ts` and
  `playwright.config.ts`: exit 0.
- `pnpm exec vitest run tests/unit/demo-media.test.ts tests/unit/demo-markup.test.ts`: 2 files, 24 tests passed.
- `pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/landing-header.test.ts tests/unit/i18n-content-text.test.ts`: 3 files,
  65 tests passed. The 23 `landing.demo.*` keys are identical in `ar.json` and `en.json`.
- Added client JS, an **estimate** rather than the Next build: esbuild 0.25.12 `--bundle --minify --format=esm --splitting` of
  `demo-video.tsx` and `demo-walkthrough.tsx`, with React, `@/i18n/*` and `@/lib/demo-media` (type-only) left external because the
  page already loads them, gives 7,919 bytes minified and **3,248 bytes gzip -9** in total (`demo-source` chunk 1,890, walkthrough 1,818,
  video entry 125). That is under the 6 KB budget. The CI build is the authoritative number.
- Fixtures in `e2e/fixtures/demo/`: 32 KB total (cap 150 KB).

