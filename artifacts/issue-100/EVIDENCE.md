# Issue #100 acceptance evidence — 2026-10-18

Part of #96. Sibling issue #99 has merged into `main` (`e646a041`), supplying the real media assets and `manifest.json` under `public/media/demo/`.

## Acceptance criteria verification mapping

| REQ / AC | Description | Verification Method & Commands | Exit Code / Result |
|---|---|---|---|
| **AC1** | Hero loop inside `.hero-scrub`, poster LCP preloaded (`fetchPriority="high"`), starts muted after `window.load` once visible, AV1 vs H.264 chosen, exactly one video downloaded | `e2e/landing-demo.spec.ts` ("hero: DemoVideo inside .hero-scrub..."), `e2e-army/100-landing-demo.e2e.ts` AC1, `tests/unit/landing-demo-media.test.ts` (`chooseSource`, `fileFor`, `clipView`), `tests/unit/landing-demo-markup.test.ts` | **PASS (0)**: Server HTML carries `preload="none"`, `muted`, `playsinline`, poster link preloads with `fetchPriority="high"`, one AV1 video requested after load. |
| **AC2** | `prefers-reduced-motion: reduce`, `saveData`, 2g: no video requests, visible "Play demo" button, single play without loop, live toggle | `e2e/landing-demo.spec.ts` (reduced motion, saveData, 2g, slow-2g, live toggle), `e2e-army/100-landing-demo.e2e.ts` AC2, `tests/unit/landing-demo-media.test.ts` (`shouldSkipVideo`) | **PASS (0)**: No `.mp4` requested under reduced motion / saveData / 2g; visible "Play demo" button appears; pressing plays once; live toggle pauses immediately. |
| **AC3** | Loops > 5s have keyboard-operable Pause/Play (>= 44x44 px, `aria-pressed`), session state preserved in `sessionStorage`, rejected `play()` (iOS Low Power Mode / `NotAllowedError`) falls back to Play button | `e2e/landing-demo.spec.ts` (Pause/Play button size, session persistence, rejected play), `e2e-army/100-landing-demo.e2e.ts` AC3, `tests/unit/landing-demo-media.test.ts` (`startPlayback` with stub) | **PASS (0)**: Toggle button is >= 44x44 px, operable via Enter/Space with `aria-pressed`, state retained in `sessionStorage` (`flowline.demo.paused`); rejected `play()` triggers blocked handler. |
| **AC4** | Walkthrough: native `<dialog>` + `showModal()`, Esc closes with focus return, `controls`, EN + AR `<track kind="captions">` (default = page locale, styled with `::cue`), 4-step chapter stepper with RTL-flipped arrow keys (`ArrowRight` back, `ArrowLeft` forward), chapter stills fallback for reduced motion / media error | `e2e/landing-demo.spec.ts` (walkthrough open/close, focus return, controls, tracks, stepper, RTL keys, media error fallback), `e2e-army/100-landing-demo.e2e.ts` AC4, `tests/unit/landing-demo-media.test.ts` (`walkthroughView`) | **PASS (0)**: Dialog uses `showModal()`, focus restored to opener on Esc, `::cue` styles present, caption tracks correctly matched to locale, chapter stepper seeks video and flips arrow navigation in RTL, stills fallback displayed on error / reduced motion. |
| **AC5** | Bento: four tiles (wide, square, square, wide on desktop, 1 column on phone), lazy start when visible, copy from i18n, note "Recorded in the app on sample data" / "تسجيل حقيقي من داخل التطبيق على بيانات تجريبية" | `e2e/landing-demo.spec.ts` (bento desktop layout, phone one column, lazy fetch on scroll), `e2e-army/100-landing-demo.e2e.ts` AC5 | **PASS (0)**: Responsive 4-tile bento grid; below-fold videos deferred until scrolled into view; honest note displayed in active locale. |
| **AC6** | RTL & LTR layout: no horizontal overflow at 360/768/1024/1440 px, controls at inline end, identical i18n keys between `ar.json` and `en.json` | `e2e/landing-demo.spec.ts` (overflow test at 360/768/1024/1440 in EN and AR), `tests/unit/landing-demo-media.test.ts` (key parity check) | **PASS (0)**: Zero horizontal overflow (`scrollWidth - clientWidth <= 1`), toggle positioned at inline end, all 25 `landing.demo.*` keys present and non-empty in both `ar.json` and `en.json`. |
| **AC7** | Performance: CLS = 0, added initial client JS <= 6 KB gz; `/media/demo/*` returns `Cache-Control: public, max-age=31536000, immutable` and answers `Range: bytes=0-1023` with status 206 | `tests/unit/landing-demo-media.test.ts` (bundle size budget & cache header check), `e2e/landing-demo.spec.ts` (real media HTTP Range delivery against `hero.ar.light.av1.e9c86093.mp4`) | **PASS (0)**: Fixed `aspect-ratio` containers guarantee CLS = 0; client JS bundle measured at 4,167 bytes (4.1 KB gz <= 6 KB gz budget); Next.js delivers immutable cache headers and status 206 with `Content-Range: bytes 0-1023/658371` and 1024-byte partial body. |
| **AC8** | Missing manifest (`public/media/demo/manifest.json` absent or invalid): page renders exactly as before (legacy `HeroPin`), no console errors, no demo controls | `e2e/landing-demo.spec.ts` ("without a manifest"), `e2e-army/100-landing-demo.e2e.ts` AC8, `tests/unit/landing-demo-media.test.ts` (`readDemoManifest` null check) | **PASS (0)**: With `fl_test_demo=off` or missing manifest, returns null, rendering standard `HeroPin` illustration with 0 demo controls and 0 console errors. |
| **AC9** | Tests green: unit, browser, e2e-army | `pnpm exec vitest run --project unit`, `pnpm exec playwright test e2e/landing-demo.spec.ts`, `pnpm e2e:army e2e-army/100-landing-demo.e2e.ts` | **PASS (0)**: All unit tests (48 tests), browser demo spec (22 tests), and e2e-army suite passed with 0 failures. |
| **AC10** | Documentation updated | `docs/landing/DEMO_MEDIA.md`, `docs/DEVELOPER_GUIDE.md`, `docs/implementation/PHASE4_BETA_REPORT.md`, `NEXT_ACTION.md`, `artifacts/issue-100/EVIDENCE.md` | **PASS (0)**: Full consumption guide, developer guide, beta progress report, and acceptance evidence updated. |

## First-hand runs in this session

1. **Unit tests**:
   ```bash
   pnpm exec vitest run --project unit tests/unit/landing-demo-media.test.ts tests/unit/landing-demo-markup.test.ts tests/unit/gate-groups.test.ts tests/unit/e2e-army-tooling.test.ts
   ```
   - **48 passed, 0 failed**, exit code 0.
   - Tests verify manifest parsing, real manifest file integrity (all 46 assets on disk with exact byte counts), source selection, playback rejection, client bundle size budget (4,167 bytes <= 6 KB gz), cache headers, i18n parity, and e2e-army file cap (<= 8 top-level files).

2. **Linter**:
   ```bash
   pnpm lint
   ```
   - **Passed, 0 errors, 0 warnings**, exit code 0.

3. **Typecheck**:
   ```bash
   node node_modules/typescript/bin/tsc --noEmit
   ```
   - **Passed, 0 errors**, exit code 0.

4. **Real media delivery**:
   - `e2e/landing-demo.spec.ts` served media test queries `/media/demo/hero.ar.light.av1.e9c86093.mp4` with `Range: bytes=0-1023`.
   - Result: HTTP status `206 Partial Content`, `Cache-Control: public, max-age=31536000, immutable`, `Content-Range: bytes 0-1023/658371`, body length 1024 bytes.

5. **Client JS size measurement**:
   - Production bundler (esbuild with ESM code-splitting and -9 gzip):
     - `demo-walkthrough.js`: 4.2 KB minified
     - `demo-video.js`: 3.1 KB minified
     - shared chunk: 1.1 KB minified
     - **Total minified**: 8,432 bytes
     - **Total gzipped (-9)**: 4,167 bytes (~4.1 KB gz)
   - Strict pass against the 6 KB gz budget.

6. **E2E-Army file cap enforcement**:
   - `tests/unit/e2e-army-tooling.test.ts` verifies the top-level `e2e-army/*.e2e.ts` file count remains <= 8.
   - Following CTO instructions, merged #166 template tests into `e2e-army/200-route-error-headers.e2e.ts`, maintaining full test coverage while keeping total top-level files at exactly 8.
