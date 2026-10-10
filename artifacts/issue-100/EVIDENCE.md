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
| 7 Lighthouse, CLS 0, <= 6 KB gz JS, headers + Range | CLS: fixed `aspect-ratio` box (markup test). Headers: `tests/unit/demo-media.test.ts`. Range 206: `e2e/landing-demo.spec.ts` "served media" (skips until #99's media is in the tree). Lighthouse and the gz size need a production build | **not measured here** (see below) |
| 8 no manifest: page unchanged, no console errors | `e2e/landing-demo.spec.ts` "without a manifest", `readDemoManifest` unit test | CI |
| 9 tests green | `pnpm lint`, `pnpm typecheck`, the unit files above: green locally | full suite runs on CI (owner rule) |
| 10 docs | `docs/landing/DEMO_MEDIA.md`, `docs/DEVELOPER_GUIDE.md`, `docs/README.md` | done |

## Not run locally, and why

- The Playwright and e2e-army specs need Postgres and a local port; the implementer sandbox blocks both (`connect EPERM 127.0.0.1:5432`).
  They are written against the final markup and run on CI.
- No production build here (owner rule: the full suite and build run on GitHub-hosted CI). Lighthouse before/after numbers and the
  gzip size of the added client JS (`demo-video`, `demo-walkthrough`, `demo-source`) must be taken from the CI build; the command is in
  #96 "Prior attempt".
