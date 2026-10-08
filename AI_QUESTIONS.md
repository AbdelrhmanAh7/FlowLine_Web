# Open items for #96 (slice 1: recorded demo + landing embed)

Slice 1 is complete (see `artifacts/issue-96/EVIDENCE.md`). These parts of the issue are out of this PR's scope (owner limit ~300 changed lines), so they need follow-up issues:

1. **Slice 2: interactive "Try it" walkthrough.** It should reuse the app's motion presets (`src/design/tokens.ts` `MOTION`, the `--dur-*` tokens in `globals.css`), with fake data, next/back, keyboard access and no API calls. Its e2e-army test should cover step navigation in EN and AR.
2. **Slice 3: Lighthouse before/after on the landing page.** This needs `lighthouse` (not a repo dependency; `npx lighthouse` would download it), so the owner should decide how to run it. Only a Playwright LCP-element check was done here (see EVIDENCE).
3. **CI suggestion (owner decision; workflows untouched):** a manual `workflow_dispatch` job that runs `pnpm demo:record` on a test stack and uploads the media as an artifact, so the video can be refreshed after UI changes without a laptop.
4. **Placement:** the video sits right after the pinned hero, not inside it. Putting a video into the 170vh `HeroPin` scrub would compete with the hero's LCP and its scroll animation. As a result, "plays muted on load (desktop)" means it plays muted as soon as it scrolls into view. Confirm, or ask for it in the hero.
5. **Environment notes:** ffmpeg was installed on this machine with Homebrew to record the assets. In this run, `e2e/reduced-motion.spec.ts` failed in setup (`POST /api/workspaces/:id/connections` returned 400 for its Sheets connection) on the ad-hoc stack (custom ports 3196/4096/4097, webpack dev). That spec and route are not touched by this PR; CI runs it on the standard stack.
