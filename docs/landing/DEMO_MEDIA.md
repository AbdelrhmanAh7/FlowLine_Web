# Landing demo media

The landing page's demo videos are recorded from the **real Flowline UI** by one local, free command. Nothing here runs
in CI (owner rule: CI jobs stay under 5 minutes and never build media). Issue [#99](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/99)
builds the pipeline; [#100](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/100) embeds the result on the landing page
through `public/media/demo/manifest.json` only. Full research, style references and tooling decision: [#96](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/96).

| Clip | Shape | Canvas · fps | Length | What it shows |
|---|---|---|---|---|
| `hero` | window (floating on the token gradient) | 1920x1080 · 60 | 16 s, seamless loop | Lead Qualifier canvas → Run → the camera pans along the flow → results in the run dock; three step chips |
| `templates` | wide tile, full bleed | 1280x720 · 30 | 7 s loop | Templates grid, hover Lead Qualifier, use it, the canvas opens |
| `build` | square tile, full bleed | 1080x1080 · 30 | 8 s loop | Empty canvas, Add node palette, search, two steps dropped and connected |
| `run` | wide tile, full bleed | 1280x720 · 30 | 7 s loop | Run, the steps light up, the finished run, the run inspector |
| `history` | square tile, full bleed | 1080x1080 · 30 | 6 s loop | History, the versions list, a version opened so **Restore as draft** shows (never clicked) |
| `walkthrough` | window | 1920x1080 · 60 | 53 s, click to play | Four chapters (template · shape the steps · run and watch · see what happened), History, Share copy, end card; captions as WebVTT |

Every clip ships in Arabic (default, RTL) and English, light theme, as AV1 and H.264 MP4 (no audio track) with a JPEG
poster; the walkthrough also ships four chapter stills and a `.vtt` caption file per locale. File names are content
hashed (`hero.ar.light.av1.5d531cbb.mp4`); `manifest.json` is the stable entry point.

## Setup (once per machine)

```bash
pnpm install                 # root deps (Playwright Chromium: pnpm exec playwright install chromium)
pnpm demo:setup              # tools/demo-video: Remotion 4.0.534 (own lockfile, not a workspace member) + its headless browser
pnpm demo:doctor             # checks everything below and prints the exact fix for each failure
```

`demo:doctor` checks: Node >= 22, Playwright Chromium, the Remotion package and its browser, that Remotion's bundled
ffmpeg has `libx264` and `libaom-av1`, that `.env.test` exists (existence only, values are never read or printed; create
it from `.github/ci/env.test.template` with a Postgres the stack can reach), at least 5 GB free, and that no other demo
build (lock `tools/demo-video/.work/build.lock`) or `next build` is running.

Run the commands **outside any agent sandbox**: headless Chromium cannot start under the Claude/Codex macOS sandbox,
and `nice` / local port binding are blocked there.

## Commands

| Command | What it does |
|---|---|
| `pnpm demo:build` | Every clip, both locales, light theme (about 35-40 min on the Mac mini; the walkthrough is about 10 min per locale). |
| `pnpm demo:build --only hero --locale ar` | One clip (about 3-5 min). `--only a,b` · `--locale ar\|en\|all` · `--theme light\|dark\|all` (dark twins are optional and not shipped) · `--concurrency 2` (Remotion render threads) |
| `pnpm demo:build --only run --skip-record` | Reuse the recording in `tools/demo-video/.work/<clip>.<locale>.<theme>/` (re-master, re-compose, re-deliver). `--skip-render` also reuses the composed video and posters (delivery only). `--rebuild` forces a fresh production build of the app. |
| `pnpm demo:build --record-only` then `… --skip-record` | Two phases for a shared machine: record (light, real time, about 2.5 min for everything) at normal priority, then render and encode (the heavy part) under the machine's governor, e.g. `/Users/…/hub-live/bin/suite.sh pnpm demo:build --skip-record`. Recording must not run under background QoS (`taskpolicy -b`): the throttled browser runs slow and the ±15 % length check fails. |
| `pnpm demo:verify` | Validates `manifest.json` and every budget, probes each video (canvas, fps, BT.709, no audio, codec string), checks loop seams, the hero's accent colour and PSNR (when `.work` is present), flags stale media, and writes a 6-still contact sheet per clip to `artifacts/demo-media/` (git-ignored; copy the ones you attach to a PR under `artifacts/issue-<N>/`). Review the sheets before committing. |
| `pnpm demo:studio` | Opens Remotion Studio on the composition (preview props in `tools/demo-video/src/defaultProps.ts`). |

Set `DEMO_DEBUG=1` to print every storyboard beat with its recorded time.

## How a clip is built

1. **Stack** (`scripts/demo/stack.ts`): an isolated test stack, production build, app on `:3190`, fakes on
   `:4190/:4191`, database `flowline_test_demo` (created and migrated when missing). It never touches the e2e stack on
   `:3100`. The `.next-test` build is shared with the e2e stack and reused (`FLOWLINE_TEST_SKIP_BUILD=1`) when it is newer
   than every change under `src/`; it is never rebuilt while another `next build` runs. A stack already healthy on
   `:3190` is reused and left running.
2. **Seed** (`scripts/demo/seed.ts`): a fresh account per recording through `e2e/helpers.ts` (`signUpVerified`, the test
   outbox) with the test-only `fl_test_beta_mode=open` cookie, on `@flowline-demo.test`, with two localized workspaces
   (AR «شركة العرض» / «عمليات العرض», EN "Demo Co" / "Demo Co Ops") so Share copy has a target, and Lead Qualifier
   flows. Every clip therefore starts from the same state ("Run #1").
3. **Record** (`scripts/demo/kit.ts`, `scripts/demo/scenarios/*.ts`): headless Chromium at a real device scale factor of
   1.5 (1280x720 CSS px → 1920x1080 frames, `page.screencast`), `reducedMotion: "no-preference"`, `fl_locale` and
   `fl_theme` cookies. Scenarios find elements by role, test id and the app's own message text (`src/i18n/messages`),
   never by position, so a UI-only change re-records without script edits. Every input is logged to `events.json` just
   before it is dispatched (eased real mouse moves, so hover states are real); scenarios also log storyboard **beats**.
   A recording is retried twice and fails when it strays more than ±15 % from its storyboard length or misses a beat.
4. **Honesty guard**: a MutationObserver records every text node and on-screen attribute the page ever renders; the
   build fails if any contained `fake-`, `localhost`, `sk-…` or an email outside `@flowline-demo.test`. The account menu is
   never opened, no integration or pricing screen is filmed, and destructive buttons are only hovered.
5. **Master** (`scripts/demo/master.ts`): the variable-rate frames become a constant 60 fps BT.709 H.264 master
   (`frames.ffconcat`, then a full-range BT.601 → limited BT.709 conversion; without it the accent drifts).
6. **Compose** (`tools/demo-video`, Remotion, composition `Demo`): token gradient (from `src/design/tokens.json`, never
   hard-coded), floating window or full-bleed crop, auto-zoom to the logged element boxes (1.35-1.8x, minimum-jerk
   easing, edge-clamped so no background shows while zoomed; square tiles keep 30 % of each zoom because they already
   crop the viewport), a vector cursor with press and ripple, glass captions, hero chips, chapter and end cards, and a
   1.1 s dissolve of the last frames into frame 0 for loops. `camera.ts` is pure and tested with `node --test`.
7. **Deliver** (`scripts/demo/deliver.ts`): AV1 (libaom, crf 36) and H.264 (High, crf 25, level 4.2 at 60 fps / 4.0 at
   30 fps) with Remotion's bundled ffmpeg, no audio. Over its target a file is re-encoded at crf + 2 (3 encodes at most)
   while the mean PSNR against the composed master stays >= 42 dB, otherwise the build fails. Posters and chapter stills
   are re-encoded to fit their budget. Files are copied to `public/media/demo/` under hashed names and merged into
   `manifest.json` (only the rebuilt clip/locale/theme slice is replaced; unreferenced files are deleted).

## Editing storyboards and captions

`scripts/demo/storyboard/<clip>.json` declares the beats a scenario must log, the hero chips, the walkthrough chapters
(card text, length, and `still`: when the chapter's still is taken), the end card and the poster moment. Captions are
`{ "beat": "run", "at": 0.2, "dur": 5.8, "ar": "…", "en": "…" }`: they resolve against the **recorded** beat time, never
absolute seconds, so a slower app moves them with it; when a slow beat pushes a caption into the next one, the earlier
one gives way. Chapter and chip numbers go through `formatNumber` from `src/i18n/format.ts` (Arabic keeps Western
digits). The end-card badge is the app's own `landing.badge`. Arabic text reuses the app's vocabulary (`ar.json` is the
source of truth).

Caption rules (checked by `tests/unit/demo-storyboards.test.ts` for every shipped storyboard): at most 2 lines of 42
characters (EN) or 34 (AR), at most 17 (EN) or 12 (AR) characters per second, at least 1.2 s on screen. Burned-in text
uses the app's own fonts (`@fontsource`, OFL): Inter Variable 600 for English, IBM Plex Sans Arabic 600 for Arabic
(tracking 0, whole-line animation only).

To change what a clip shows, edit its scenario in `scripts/demo/scenarios/` (keep role/test-id/message locators and log a
beat for anything a caption or card hangs on), adjust the storyboard, then `pnpm demo:build --only <clip>` and
`pnpm demo:verify`.

## Budgets (checked by `demo:verify`)

| Item | Target | Hard cap |
|---|---|---|
| `hero` | AV1 <= 1.6 MB, H.264 <= 3.2 MB | 6 MB per file |
| `templates`, `run` | AV1 <= 0.45 MB, H.264 <= 0.9 MB | 6 MB |
| `build` | AV1 <= 0.5 MB, H.264 <= 1.0 MB | 6 MB |
| `history` | AV1 <= 0.4 MB, H.264 <= 0.8 MB | 6 MB |
| `walkthrough` | AV1 <= 4.5 MB, H.264 <= 6 MB | 6 MB |
| posters / chapter stills | <= 90 KB / <= 70 KB | |
| `public/media/demo/` | | 45 MB in total |

Quality: mean PSNR >= 42 dB against the composed master at 6 sample times; loop seam (last vs first frame) >= 35 dB;
the hero's decoded Run button within 6 levels per channel of `semantic.light.accent`. Sizes are decimal (1 MB = 10^6 bytes).

## Manifest contract

`public/media/demo/manifest.json` (`schema: 1`, validated by `scripts/demo/manifest.ts` and a fixture test) lists
`uiCommit` (the recorded UI's commit), the tooling versions, per-clip metadata (`shape`, `aspect`, `width`, `height`,
`fps`, `durationS`, `loop`, walkthrough `chapters` with their start times) and every file (`video` with `codec`, the
`type` string from ffprobe such as `video/mp4; codecs="av01.0.09M.08"`, `bytes`, `sha256`, `bitrate`; `poster`;
`captions` with `lang`; `chapter-still` with `chapter`). Landing code treats a missing manifest as "no demo yet".
`demo:verify` prints `stale:` when `src/` changed since `uiCommit`; regenerate at UI freezes only (each full rebuild adds
about 15-20 MB of binaries to git history).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Chromium … sandbox` / `listen EPERM` / `setpriority: Operation not permitted` | run outside the agent sandbox |
| `another demo build is running (pid N)` | wait, or remove a stale `tools/demo-video/.work/build.lock` |
| `another next build is running` | a gate/e2e build owns `.next-test`; wait for it |
| A recording fails | the error names the locator and time; `tools/demo-video/.work/<clip>.<locale>.<theme>/failure.png` shows the page; `DEMO_DEBUG=1` prints the beats |
| `recorded 9.3 s, storyboard 8 s` | the scenario is too slow: shorten its moves or holds (its `holdUntil` pads only when it is early). Under a CPU governor or background QoS, record with `--record-only` at normal priority first |
| `honesty guard: the DOM contained …` | the scenario opened something with test-double or real-looking data; film another element |
| `Version mismatch … zod` | `tools/demo-video` pins zod 4.5.4 for Remotion; run `pnpm demo:setup` again |
| `over the … target at crf …` | the clip got busier: shorten it or accept a higher crf in `scripts/demo/clips.ts` (keep PSNR >= 42) |

## License note (Remotion)

Remotion is source-available: its Free License covers a company of three people or fewer ("Even if you are
incorporated, you can operate under the Free License, as long as your total headcount is 3 or less."). Every
`remotion` / `@remotion/*` package is pinned to the identical exact version (4.0.534) in `tools/demo-video`. Re-read
<https://www.remotion.dev/docs/license/faq> on every upgrade, and never add a paid or telemetry service. The compositor
only reads `events.json` + `master.mp4`, so Revideo (MIT) remains a drop-in fallback.
