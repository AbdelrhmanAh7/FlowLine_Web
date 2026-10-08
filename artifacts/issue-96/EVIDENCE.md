# Evidence for #96, slice 1 (landing demo video)

Tested at commit `a62efdd90a54c51d6e3ad28f899857350bd51def` (branch `ai/96`). Isolated test stack: `scripts/dev-test.mjs` logic, `next dev --webpack`, ports 3196/4096/4097, DB `flowline_test_demo96`, FLOWLINE_ENV=test. Only fake data was used.

| Requirement | How it is verified | Result |
|---|---|---|
| Recorder re-runnable, real UI, fake data | `BASE_URL=http://localhost:3196 tsx scripts/record-demo.mts` (fresh `demo-…@flowline-demo.test` account) | `demo (38.4 s) → public/media/flowline-demo.{mp4,webm,jpg,en.vtt,ar.vtt}`; contact sheet checked by eye (sign-in, canvas, run SUCCESS, inspector, share "Copied to the other workspace") |
| H.264 mp4 + VP9 webm, 1280×720, 30–60 s | `ffprobe` | mp4 h264 1280×720; webm vp9 1280×720, duration 38.400 s |
| Each asset ≤ 6 MB | `ls -l`; `vitest run tests/unit/landing-demo-assets.test.ts` | mp4 352,163 B, webm 494,482 B, jpg 37,991 B, vtt 325/404 B; 6/6 passed |
| EN + AR captions in sync | the cue times come from scene marks during recording; the unit test checks identical EN/AR times, ordered cues, last end in 30–60 s | passed |
| Poster, both sources, EN/AR tracks, muted autoplay in view, keyboard toggle, AR RTL + Arabic default track | `e2e run tests/96-landing-demo.e2e.ts` (hub e2e v0.18.0, locator steps, no model) against :3196 | 3/3 passed |
| Reduced motion: poster + "Play demo", no autoplay, the button plays it; a keyboard pause sticks; the AR control sits at the left edge | `playwright test e2e/landing-demo.spec.ts --project=chromium --repeat-each=2` | 6/6 passed |
| Existing landing behaviour kept | `playwright test e2e/landing.spec.ts --project=chromium` | 23/23 passed (run before the final `preload="none"` change) |
| Video does not block LCP | Playwright `largest-contentful-paint` observer, 1440×900 and 375×812 (motion) and 1440×900 (reduced) | the LCP element is the hero `<h1>` in all three; no mp4/webm request before scrolling (only the poster jpg and the default vtt) |
| Lighthouse score not lower | not run (see AI_QUESTIONS.md item 2) | **not measured** |
| Lint / types | `eslint` on the changed files; `tsc --noEmit` | clean |
| Not run locally | the full suite (CI runs it, owner rule 2026-10-08); `e2e/reduced-motion.spec.ts` failed in setup on this ad-hoc stack (Sheets connection 400), and that code is unrelated to this change | n/a |
