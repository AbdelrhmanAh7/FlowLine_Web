# Evidence for #99 — landing demo media recording pipeline

Part of #96. Branch `ai/99`. The pipeline code was last changed in `865c674`; the assets in `public/media/demo/` were
recorded from the UI at `main` `d211653` (this branch changes nothing under `src/`), and `manifest.json` records the
branch head of the build (`uiCommit`). Machine: Mac mini M4, 16 GB, macOS, Node 26.10, outside the agent sandbox.
Isolated stack: production build in `.next-test`, app `:3190`, fakes `:4190/:4191`, DB `flowline_test_demo` on a
throwaway local Postgres; only sample data (`demo-<locale>-<id>@flowline-demo.test`, workspaces «شركة العرض» /
«عمليات العرض», "Demo Co" / "Demo Co Ops").

E2E: not needed — dev tooling, no user flow (the landing embed is #100).

| # | Acceptance item | How it was verified | Result |
|---|---|---|---|
| 1 | `pnpm demo:setup && pnpm demo:doctor` pass | `pnpm --dir tools/demo-video install --ignore-workspace --frozen-lockfile` (233 ms, lockfile unchanged), `remotion browser ensure`, then `pnpm demo:doctor` | all 8 checks `ok` (Node 26.10, Playwright Chromium, Remotion package + browser, `libx264` + `libaom-av1`, `.env.test` present (not read), 42 GB free, no other build); each failing check prints its `fix:` line |
| 2 | `demo:build --only hero --locale ar` <= 6 min, hashed AV1 + H.264 + poster + manifest; 1920x1080, 60 fps, BT.709, no audio, budgets; accent within 6; PSNR >= 42 dB | timed runs at normal priority: 3 min 22 s (record + master + render + deliver) and 3 min 01 s (`--skip-record`); `pnpm demo:verify` probes and checks | AV1 ≈ 0.66 MB (target 1.6), H.264 ≈ 1.2 MB (target 3.2), poster ≈ 75 KB; 1920x1080, 60 fps, `bt709/bt709/bt709`, no audio stream; Run button decodes rgb(101,89,228) vs `semantic.light.accent` rgb(106,90,232) (max 5 off); mean PSNR vs the composed master 47.5 dB (AV1) / 45.9 dB (H.264). Under the machine governor's background QoS the same clip took 11 min, so heavy phases there take longer than the target, which assumes normal priority |
| 3 | All six scenarios green in `ar` and `en` on the isolated stack, ±15 % of storyboard length, DOM honesty guard, `:3100` untouched | `pnpm demo:build --record-only` (stack started and stopped by the CLI) and the full builds; the guard runs in every recording | recorded lengths: hero 16.00 s (ar, en), templates 7.00 s, build 8.00/8.64 s, run 7.00 s, history 6.00 s, walkthrough 53.00 s (ar, en); guard found nothing; only ports 3190/4190/4191 were used |
| 4 | `camera.test.ts`: zoom clamp, return to wide, direct pan < 1.2 s, edge clamp, loop seam PSNR >= 35 | `cd tools/demo-video && node --test src/camera.test.ts` | 12/12 pass (also: establishing shot, arrival >= 0.12 s before the click, 0.8-1.2 s zoom-in, caption lift, square-tile zoom share, cursor/press/ripple/opacity) |
| 5 | Full output committed: <= 45 MB, every file <= 6 MB, valid manifest, `demo:verify` green, contact sheets | `pnpm demo:verify` after the last clip | see "Final verify" below; three contact sheets in this folder |
| 6 | Isolation: root install/lint/typecheck/test unchanged; no workflow touched | `pnpm install --frozen-lockfile` (0.4 s), `pnpm lint` (clean), `pnpm typecheck` (clean), `node node_modules/vitest/vitest.mjs run --project unit tests/unit/demo-` (7 files, 59 tests, < 1 s); `git diff --stat origin/main HEAD -- .github` (empty) | `tools/demo-video` is excluded from root tsc/ESLint/Vitest and is not a workspace member; the only root dependency change is `sharp@0.35.4` as a devDependency (already in the lockfile via Next); no file under `.github/` changed |
| 7 | A UI-only change re-records without script edits | scenarios use roles, test ids and `src/i18n/messages` text only (no coordinates); the same scripts record the mirrored Arabic layout and the English one without branches beyond reading direction | by design; not exercised with an actual UI change in this PR |
| 8 | Docs | `docs/landing/DEMO_MEDIA.md` (new), `docs/DEVELOPER_GUIDE.md`, `README.md`, `docs/implementation/PROGRESS.md` | updated in this PR |

## Final verify

(filled in below after the last clip)

## Notes and limitations

- Remotion's bundled ffmpeg is a minimal build (no `psnr` filter, no `rawvideo` muxer): PSNR and colour checks decode
  frames through a PNG pipe with an explicit BT.709 conversion and compute in JS.
- The ±15 % length rule needs real-time recording at normal priority; on this governed machine the build runs as
  `pnpm demo:build --record-only` (light) followed by `suite.sh pnpm demo:build --skip-record` (heavy).
- Not run locally: the full test suite and the app build gate (CI runs them, owner rule 2026-10-08). Dark twins are
  supported (`--theme dark`) but not built or shipped.
