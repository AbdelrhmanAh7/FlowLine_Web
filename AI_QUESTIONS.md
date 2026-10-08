# Questions / open items for #96 (slice 1)

1. **Media assets not committed.** ffmpeg is not installed on this machine, so `public/media/flowline-demo.*` could not be produced (and no app + seeded demo user was available). Run `pnpm demo:record` (see docs/DEVELOPER_GUIDE.md) and commit the output; until then the section hides itself and the e2e-army test will fail on a missing video. Captions are placeholder 10 s cues; check them against the real recording.
2. `scripts/record-demo.ts` selectors (flows link, Run, Export/Share) are untested against the live UI.
3. Not done here: asset-size/duration unit guard, Lighthouse measurement, interactive walkthrough (slices 2–3), CI suggestion: run `pnpm demo:record` on demand via a manual workflow (owner decision).
4. lint/typecheck not run: the worktree has no node_modules.
