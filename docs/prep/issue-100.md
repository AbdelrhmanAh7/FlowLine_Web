# Prep for #100: Landing demo media (2/2): landing embed + walkthrough — hero loop, bento loops, 53 s walkthrough, reduced motion

> Offline floor prep (2026-10-10T10:50Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (9 of 7 week-points today; opencode: held until 12:02Z (opencode rate-limited 5× in a r; agy: held until 10-14 14:35Z (4 d 4 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-plan -->
Part of #96 (umbrella: owner goal, original steps, shared **Modern style spec**). Sibling: #99, which produces the media. **Do not wait for it:** develop and test against **fixtures** and the manifest contract (section 9). Full research and references: #96 sections 1, 2, 6. Prior basic attempt (superseded, reuse ideas): PR #97, branch `ai/96` (`git show origin/ai/96:src/components/landing/demo-video.tsx`).

## Goal
Show the product in motion on the landing page with the media from #99: a **hero loop** inside the hero visual, a **"See it in action" bento** of four loops, and a **53 s walkthrough** (dialog, chapter stepper, EN/AR captions) that doubles as the interactive walkthrough. Arabic-first and RTL-correct, reduced-motion safe, LCP-safe, honest ("Recorded in the app on sample data"). If no manifest exists the page must render exactly as today.

## What to build
1. `src/lib/demo-media.ts`: server-side manifest reader (returns `null` when `public/media/demo/manifest.json` is missing) + pure helpers `fileFor(manifest, clip, locale, theme)` and `chooseSource(files, caps)`.
2. `src/components/landing/demo-video.tsx` (client, reuse the lazy-play and "user pause sticks" ideas of PR #97): behaviour in section 6, <= 6 KB gz, no new dependency.
3. `src/components/landing/demo-bento.tsx` and `demo-walkthrough.tsx` (native `<dialog>`, chapter stepper, caption tracks, chapter-still fallback).
4. `src/app/page.tsx`: hero visual (inside `.hero-scrub`, fall back to today's `HeroPin` when the manifest is `null`), "Watch the walkthrough" button, bento section.
5. `src/i18n/messages/{ar,en}.json` (keys below), `src/app/globals.css` (`::cue`, tile layout, reduced-motion; design-system values only; motion <= 300 ms), `next.config.ts` `headers()` for `/media/demo/:path*`.
6. Tests: `e2e/landing-demo.spec.ts` and `e2e-army/96-landing-demo.e2e.ts` (port and extend both from `ai/96`) using fixtures in `e2e/fixtures/demo/` (<= 150 KB total, served with `page.route`), plus Vitest for `chooseSource` and manifest parsing.
7. Docs: consumption section in `docs/landing/DEMO_MEDIA.md` (create it if #99 has not landed; keep the name), `docs/DEVELOPER_GUIDE.md` if commands change.

## Acceptance (the original acceptance of #96 stays; these make it testable)
1. With a manifest: the hero shows `DemoVideo` inside `.hero-scrub`; the poster is the LCP element and is preloaded (`fetchPriority="high"`); the loop starts muted after `load` once visible; AV1 vs H.264 chosen per section 6; exactly one video file is downloaded.
2. `prefers-reduced-motion: reduce`, `saveData` and 2g: **no video request is made**; poster + visible **Play demo** button; pressing it plays once without loop; reduce toggled live pauses at once.
3. Loops longer than 5 s have a visible, keyboard-operable Pause/Play (>= 44x44 px, `aria-pressed`), state kept for the session; a rejected `play()` (iOS Low Power Mode, `NotAllowedError`) shows the Play button (unit-test the handler with a stub).
4. W

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/codex-stdout.md`
- `artifacts/ai-hub/gate-e1a479b/GATE.md`
- `artifacts/ai-hub/gate-final-c2fd494/GATE.md`
- `artifacts/ai-hub/research/providers-2026-09-29.md`
- `artifacts/ai-hub/wavec-84f2cc1/BUGS.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST-cceeb5d.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST2-f74a5a1.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md`
- `artifacts/beta-execution/20260930-landing-executor/CP25_SOURCE_REVIEW.md`

## Existing tests nearby

- none found

## Test plan (ollama:qwen3:8b)

- **Test Case 1**: Verify hero loop plays on manifest load  
  **Setup**: Simulate manifest presence, load `page.tsx`  
  **Assertion**: Hero shows `DemoVideo` inside `.hero-scrub`, poster is LCP, preloaded  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: No manifest → fallback to `HeroPin`

- **Test Case 2**: Reduced motion + saveData → no video request  
  **Setup**: Use `prefers-reduced-motion: reduce` and `saveData`  
  **Assertion**: Poster + "Play demo" button visible, no video fetch  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: Toggle reduce → pause video

- **Test Case 3**: Pause/Play button for >5s loops  
  **Setup**: Load loop >5s, simulate user interaction  
  **Assertion**: Button visible, keyboard operable, state persists  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: iOS Low Power Mode → show Play button

- **Test Case 4**: Caption tracks for EN/AR  
  **Setup**: Load walkthrough with EN/AR captions  
  **Assertion**: Captions display correctly, toggle between languages  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: No captions → fallback to chapter stills

- **Test Case 5**: Chapter stepper and dialog interaction  
  **Setup**: Open walkthrough dialog, navigate through chapters  
  **Assertion**: Stepper updates, dialog closes on exit  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: No manifest → dialog not shown

- **Test Case 6**: `chooseSource` selects correct video format  
  **Setup**: Mock manifest with AV1 and H.264 files  
  **Assertion**: `chooseSource` picks AV1 for desktop, H.264 for mobile  
  **File**: `e2e-army/96-landing-demo.e2e.ts`  
  **Edge**: No caps → default fallback

- **Test Case 7**: Bento section renders four loops  
  **Setup**: Load `demo-bento.tsx` with manifest  
  **Assertion**: Four loops displayed, responsive layout  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: No manifest → bento not shown

- **Test Case 8**: `fileFor` returns correct file path  
  **Setup**: Mock manifest, call `fileFor` with clip, locale, theme  
  **Assertion**: Returns correct file path based on inputs  
  **File**: `e2e-army/96-landing-demo.e2e.ts`  
  **Edge**: Missing file → returns null

- **Test Case 9**: `prefers-reduced-motion` pauses video  
  **Setup**: Load video, toggle `prefers-reduced-motion`  
  **Assertion**: Video pauses, Play button shows  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: No manifest → no video

- **Test Case 10**: LCP element is the poster  
  **Setup**: Load page with manifest  
  **Assertion**: Poster is LCP element, preloaded  
  **File**: `e2e/landing-demo.spec.ts`  
  **Edge**: No manifest → LCP is original hero image
