# Prep for #99: Landing demo media (1/2): recording pipeline — real UI to Screen-Studio-style video, free local tooling

> Offline floor prep (2026-10-12T09:12Z): capacity 0 — claude: claude daily budget spent (14% of 4.4% week-points; codex: held until 12:47Z (codex 5-h 100% used (codex app-; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:36Z (2 d 5 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-plan -->
Part of #96 (umbrella: owner goal, original steps, shared **Modern style spec**). Sibling: #100, which consumes this issue's output only through `public/media/demo/manifest.json` (contract in section 9). Full research, references and tooling decision: #96 sections 1, 2 and 7. Prior basic attempt (superseded, reuse ideas): PR #97, branch `ai/96`.

## Goal
One **local, free, reproducible** command regenerates the landing demo media from the **real Flowline UI**: hero loop (16 s), four bento loops (6-8 s), a 53 s walkthrough, in Arabic (default, RTL) and English, as AV1 + H.264 MP4 with JPEG posters, chapter stills, WebVTT captions and a manifest. Look = Screen-Studio style (auto-zoom to element boxes, vector cursor + ripple, floating window on a gradient built from the app's design-system colours). Cost $0. **Local scripts only; never add a CI job.**

## What to build
1. `scripts/demo/**` (root; typechecked, linted): `cli.ts`, `kit.ts` (recorder helpers), `stack.ts`, `scenarios/{hero,templates,build,run,history,walkthrough}.ts`, `storyboard/*.json`, `master.ts`, `deliver.ts`, `vtt.ts`, `manifest.ts`, `doctor.ts`, `verify.ts`.
2. `tools/demo-video/**`: isolated Remotion package (exact pins `4.0.534` for `remotion`, `@remotion/cli` and every `@remotion/*`, `react@19.3.0`, `typescript@6.0.3`, own lockfile, **not** a workspace member, excluded from root tsc/ESLint/Vitest).
3. Root `package.json`: `demo:setup`, `demo:doctor`, `demo:build`, `demo:verify`, `demo:studio` (section 8); `.gitignore` for `tools/demo-video/{node_modules,.work,out}`; optional devDependency `sharp@0.35.4` (already in the lockfile via Next) for the colour/PSNR checks and the contact sheet.
4. `public/media/demo/**`: the generated, content-hashed assets + `manifest.json` (committed).
5. `docs/landing/DEMO_MEDIA.md` (setup, commands, editing storyboard/captions, budgets, license note, troubleshooting) and `docs/DEVELOPER_GUIDE.md`.
6. Tests: `tests/unit/demo-*.test.ts` (Vitest: ffconcat builder, VTT writer, manifest + budget loop with fake sizes, events schema) and `tools/demo-video/src/camera.test.ts` (`node --test`).

**Start from the verified prototype** in the first comment on this issue (recorder, master, camera, composition). **Exact commands: section 8 below.**

## Acceptance
1. `pnpm demo:setup && pnpm demo:doctor` pass on the Mac mini. Doctor checks Node >= 22, Playwright Chromium, Remotion browser, `remotion ffmpeg` has `libx264` + `libaom-av1`, `.env.test` exists (existence only; never print values), >= 5 GB free, no other build running (lock file); every failure prints the exact fix.
2. `pnpm demo:build --only hero --locale ar` finishes in <= 6 min and writes hashed AV1 + H.264 + poster + manifest entries. Both videos 1920x1080, 60 fps, BT.709 (`ffprobe`), **no audio stream**, inside the section 5 budgets; the decoded accent colour of the Run button is within 6 per channel of `semantic.light.accent`; mean PSNR vs the master >= 42 dB at 6 sample times.
3

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/ci/env.test.template`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `e2e/tools/webkit-env.mjs`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:gemma3:4b)

Okay, here’s a test plan for Issue #99, focusing on key aspects of the demo media generation pipeline, designed for a senior test engineer:

**Test Plan: FlowLine Demo Media Generation**

**Overall Goal:** Verify the local demo media generation process produces high-quality, consistent assets meeting specified criteria.

**1. Setup Verification (tests/unit/demo-doctor.test.ts)**
   * **Name:** Node & Dependencies Check
   * **Setup:** `pnpm demo:setup` – Run the doctor script.
   * **Assertion:**  Node >= 22, Playwright Chromium, Remotion browser, `remotion ffmpeg` with required libraries, `.env.test` exists, >= 5GB free space, no concurrent builds.
   * **Edge Case:** Simulate a missing dependency (e.g., remove `libx264` from ffmpeg).

**2. Hero Loop Quality (tests/unit/demo-build.test.ts)**
   * **Name:** AV1/H.264 Quality Check
   * **Setup:** `pnpm demo:build --only hero --locale ar`
   * **Assertion:** Decoded accent colour within 6dB of `semantic.light.accent`. Mean PSNR >= 42dB at 6 sample times. Video resolution 1920x1080, 60fps.
   * **Edge Case:**  Vary the locale (en, es) to ensure consistent colour mapping.

**3. Manifest Validation (tests/unit/demo-manifest.test.ts)**
   * **Name:** Manifest Structure
   * **Setup:** `pnpm demo:build --only hero --locale ar`
   * **Assertion:**  Manifest file (`public/media/demo/manifest.json`) contains expected entries (video URLs, chapter info, VTT URLs).
   * **Edge Case:**  Manually modify the manifest to ensure the system correctly identifies and references the generated assets.

**4. VTT Caption Verification (tests/unit/vtt.test.ts)**
   * **Name:** VTT Content
   * **Setup:** `pnpm demo:build --only hero --locale ar`
   * **Assertion:** VTT file (`public/media/demo/chapter-titles.vtt`) contains accurate chapter timings and text.
   * **Edge Case:**  Introduce a minor error in the VTT file to verify the writer handles it gracefully.

**5.  Remotion Camera Test (tools/demo-video/src/camera.test.ts)**
   * **Name:** Camera Output
   * **Setup:** Run the `node --test` command for the camera test.
   * **Assertion:**  The generated camera output is a valid video file.
   * **Edge Case:**  Test with different resolutions or frame rates.

**6.  Master Asset Comparison (tests/unit/demo-build.test.ts)**
    * **Name:** Master Asset Match
    * **Setup:** `pnpm demo:build --only hero --locale ar`
    * **Assertion:** The generated AV1/H.264 assets are visually similar to the master asset (measured by PSNR).
    * **Edge Case:**  Introduce a slight variation in the master asset to check for robustness.

**7.  Command Time Validation (tests/unit/demo-build.test.ts)**
    * **Name:** Build Time
    * **Setup:** `pnpm demo:build --only hero --locale ar`
    * **Assertion:** Build time <= 6 minutes.
    * **Edge Case:**  Run the command multiple times to check for consistent performance.

**File Association:**
*   `tests/unit/demo-*.test.ts`:  Core build and asset validation tests.
*   `tests/unit/vtt.test.ts`: VTT content validation.
*   `tools/demo-video/src/camera.test.ts`: Camera output validation.

**Notes:**
*   Focus on automated tests for critical quality checks.
*   Manual inspection of generated assets is essential for visual quality.
*   Lockfile
