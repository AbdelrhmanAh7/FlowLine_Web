# Codex: full manual test with COMPUTER USE on the final candidate (independent reviewer)

The owner asked for everything to be tested manually, with computer use: you control the real desktop (screenshots,
mouse, keyboard) and drive the installed Google Chrome as a person would.

## Rules
- **Computer use for the UI.** Operate Google Chrome through desktop control. Record which computer-use tool/runtime
  you used and its version.
  - If computer use is unavailable, say so plainly and fall back to headed Playwright `channel: "chrome"`. Label every
    result obtained that way. Don't claim computer use you didn't have.
- **Browser profile:** use a new Chrome window with a fresh temporary profile
  (`--user-data-dir=artifacts/design-v2/chrome-qa/manual-cp8/.profile`), never the owner's own profile, tabs or
  accounts. Don't touch other applications or windows.
- **Don't modify** product code, tests or configuration. Write only under `artifacts/design-v2/chrome-qa/manual-cp8/`,
  and append findings to `artifacts/design-v2/BUGS.md` as `DV2-M01+`. Don't commit.
- **Don't start, stop or rebuild** servers or containers. Never read or print `.env*` or secrets, and keep secrets out
  of screenshots.
- **Test doubles only:** SaaS/OAuth fakes on `127.0.0.1:4010`, AI fake on `127.0.0.1:4011`. This is not live-provider
  verification. No paid calls.
- **Fault injection:** allowed, `times:1` only. Always reset what you set, and say whenever you used it.

## Target
- **URL:** `http://localhost:3100`, a production build of the FINAL candidate.
  - `refs/checkpoints/design-v2-closeout-8` = `a4eeabd` (tree `be6dc87`).
  - `.next-test/BUILD_ID` = `0182teFiYHLhmljkCbuL5`.
  - Record both, and `git rev-parse HEAD`, at the start and end.
- **Accounts:** synthetic `@flowline-qa.test` accounts through the UI; the outbox is at
  `curl "http://localhost:3100/api/test/outbox?email=<address>"`.
- **Admin setup code:** `node scripts/with-env.mjs .env.test npx tsx scripts/admin/bootstrap.mts --email <you> --grant`.
  TOTP codes come from `e2e/tools/totp.ts`.

## Manual journeys (each PASS / FAIL / BLOCKED, with screenshots)
1. **Public landing:** EN/AR, light/dark, desktop and phone-width window. Language/theme switching from the header,
   scroll motion, and no sideways scroll.
2. **Accounts:** sign-up, verify, sign-in and sign-out, in Arabic and English. Onboarding, then the dashboard.
3. **Build a workflow by hand:** drag nodes, connect them, configure a JSONata expression, save, reload, run, and
   inspect the run and every inspector tab.
4. **Failure paths:** an invalid flow; a failing AI step (a 401 fault); an approval step (approve once); revoke the
   Sheets fake, reconnect, and confirm nothing auto-runs. Include the Arabic messages.
5. **Team:** invite an Editor and a Viewer, check the permission boundaries, remove a member, and check the 404s.
6. **AI Providers via the UI:** connect, discover and pick a model, run, rotate, disconnect; the invalid-key path;
   isolation in a second workspace.
7. **Copilot:** proposal, diff, reject, approve as a draft.
8. **Settings:** every tab. **Admin panel:** setup, TOTP, step-up, a write-only credential. A non-admin gets 404.
9. **Accessibility by keyboard only:**
   - tab through the main screens;
   - every dialog: focus trap, Escape and focus return, including the **phone run sheet**, which must now be a modal
     dialog (`aria-modal`), the DV2-Q05 recheck;
   - disabled controls with reasons;
   - reduced motion (Windows "Animation effects" off, or Chrome emulation if you can't change OS settings safely; say
     which).
10. **Phone width (~375):** monitor-only mode, and the run sheet.

## Report
`artifacts/design-v2/chrome-qa/manual-cp8/REPORT.md` containing:
- the environment (the computer-use tool, the Chrome version, headed, the snapshot, BUILD_ID);
- the journey table;
- the console/network issues seen;
- new findings (`DV2-M01+` in BUGS.md with severity, classification, reproduction, expected/actual, snapshot/build);
- an explicit list of what wasn't covered.
