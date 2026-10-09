# Landing demo media

The landing page shows the product in motion: a hero loop, a "See it in action" bento of four loops and a 53 s walkthrough.
The media is recorded from the real UI by the pipeline of issue [#99](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/99)
(generation: commands, budgets, storyboards; that section arrives with #99). This document describes the other half, issue
[#100](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/100): how the landing page consumes it. Research, style spec and
umbrella: [#96](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/96).

## Consumption on the landing page

**The manifest is the only coupling.** `src/lib/demo-media.ts` reads `public/media/demo/manifest.json` on the server (`schema: 1`,
a `hero` clip required). Missing, unreadable or invalid: `readDemoManifest` returns `null` and the page renders exactly as before
(today's `HeroPin` illustration, no section, no button, no console output). Malformed clips and files are dropped; file paths must
be plain names (no folders).

| Piece | File | What it does |
|---|---|---|
| Reader + helpers | `src/lib/demo-media.ts` | `readDemoManifest`, `parseManifest`, `fileFor(manifest, clip, locale, theme, kind, extra)` (dark falls back to light, a locale without files to Arabic), `clipView` / `walkthroughView` (serialisable props) |
| Pure client helpers | `src/lib/demo-source.ts` | `chooseSource(files, caps)`, `shouldSkipVideo`, `startPlayback`; re-exported by `demo-media.ts` |
| `DemoVideo` | `src/components/landing/demo-video.tsx` | one loop: poster, lazy start, source choice, Pause/Play |
| Bento | `src/components/landing/demo-bento.tsx` | four tiles: templates (wide), build (square), history (square), run (wide); one column below `lg`, three columns from `lg` |
| Walkthrough | `src/components/landing/demo-walkthrough.tsx` | native `<dialog>` + chapter stepper + EN/AR caption tracks |
| Wiring | `src/app/page.tsx` | hero visual inside `.hero-scrub` (via `HeroPin`'s `media` prop), the "Watch the walkthrough" button, the bento |

### Behaviour of a loop (`DemoVideo`)

- **Server markup is correct without JS**: `<video muted playsInline loop preload="none" poster width height aria-label>` in a box
  with a fixed `aspect-ratio` (CLS 0), no `autoplay` attribute, an H.264 `<source>` as the default. The poster is the LCP element;
  the hero poster is also preloaded (`preload(..., { as: "image", fetchPriority: "high" })`).
- **JS starts it** only after `window.load` and once the tile is visible (IntersectionObserver, threshold 0.25, root margin 200 px);
  it pauses when out of view or when the tab is hidden. `video.muted = true` is set in the ref callback before any `play()`.
- **Source choice** (`chooseSource`, `MediaCapabilities.decodingInfo` with the manifest's `type`, size, fps and bitrate): AV1 if
  supported, smooth and power efficient; else H.264 if supported; else software AV1 (supported and smooth); else poster + Play.
  `src` is set only after the choice, so exactly one video file is downloaded. Without MediaCapabilities it falls back to
  `canPlayType` (H.264 first).
- **No video at all** (poster + a visible **Play demo** button, nothing fetched) under `prefers-reduced-motion: reduce`,
  `navigator.connection.saveData` and `effectiveType` `slow-2g`/`2g`. Pressing the button plays once, without loop. The media query is
  followed live: switching reduce on pauses at once.
- **A rejected `play()`** (iOS Low Power Mode, `NotAllowedError`) shows the Play button; the first tap anywhere on the tile starts it.
- **Pause/Play button** on every loop longer than 5 s (WCAG 2.2.2): at least 44x44 px, `aria-pressed` (true while paused),
  keyboard operable, at the inline end; the visitor's pause is kept for the session (`sessionStorage`, key
  `flowline.demo.paused`) and is never undone by scrolling.

### Walkthrough

The button (`data-testid="demo-watch"`) opens the dialog with `showModal()`; Esc or Close closes it and focus returns to the
button. The video has `controls`, no loop, `<track kind="captions">` for `ar` and `en` (the page language is the default track,
styled by `::cue` in `globals.css`). The stepper has one button per manifest chapter plus Back/Next; `aria-current="step"`; Left/Right
arrows follow the reading direction (flipped in RTL), Home/End jump. Choosing a chapter seeks the video to its start time.
Under reduced motion nothing plays by itself and the active chapter's **still** and text are shown, so the walkthrough works
without playback. No API calls; it works logged out.

### Delivery

`next.config.ts` `headers()` serves `/media/demo/:path*` with `Cache-Control: public, max-age=31536000, immutable` (file names are
content-hashed; Next's default for `public/` is `max-age=0`). `Range` requests are answered with `206` by Next's static server
(`e2e/landing-demo.spec.ts`, "served media", runs once the real media is in the tree).

### Honest copy

Every string is in `src/i18n/messages/{ar,en}.json` under `landing.demo.*` (identical keys; Arabic is the source). The page says
"Recorded in the app on sample data" and makes no claim about AI, integrations, pricing or numbers.

### Tests and fixtures

- `e2e/fixtures/demo/` (about 20 KB): a schema-1 manifest plus one tiny video, poster and two caption files.
- On the test stack (`FLOWLINE_ENV=test`, ignored everywhere else) the cookie `fl_test_demo=fixture` makes the server read the fixture
  manifest and `fl_test_demo=off` ignores a real manifest. `playwright.config.ts` sets `off` for every spec, so the legacy hero keeps
  being tested after the real media lands; `e2e/landing-demo.spec.ts` sets `fixture` and answers `/media/demo/*` with `page.route`.
  Playwright builds lack H.264, so playback is stubbed: those specs assert **when** video is requested, **which** file and what the
  visitor can operate, not decoding.
- `e2e-army/100-landing-demo.e2e.ts` is the blocking `e2e-army` flow (hero, Pause/Play, walkthrough in Arabic, bento).
- `tests/unit/demo-media.test.ts` (manifest parsing, `fileFor`, `chooseSource`, the `play()` handler, the cache header, i18n keys) and
  `tests/unit/demo-markup.test.ts` (server markup).

### Regenerating or swapping media

Run the #99 pipeline and commit `public/media/demo/`; nothing else changes. If a locale has no files, the page falls back to the
Arabic ones; a clip without a poster or video is left out of the bento.
