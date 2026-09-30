# Codex: retest the design-v2 findings in real Google Chrome (independent reviewer)

You filed DV2-Q01…Q05 (functional Chrome QA) and DV2-V01…V03 (visual review) on checkpoint 4. The lead has fixed them,
plus DV2-L01 (switcher target size). **Retest each one** on the new build and give a verdict.

## Rules (same as before)
- **Don't modify** product code, tests, configuration, baselines or reference images. Write only under
  `artifacts/design-v2/chrome-qa/retest/`, and add a "Retest (cp7)" line under each finding in
  `artifacts/design-v2/BUGS.md`. Don't commit.
- **Don't start or stop servers/containers.** One browser session only. Never read or print `.env*` or secret values.
  No secrets in files or screenshots.
- **Test doubles only:** AI fake `127.0.0.1:4011`; SaaS/OAuth fakes `127.0.0.1:4010`, with the same fault/revoke
  controls as your first run. This is not live-provider verification. No paid calls.
- **Browser:** real Google Chrome via Playwright `channel: "chrome"` with an explicit executable, **headed**, and a
  fresh profile under `artifacts/design-v2/chrome-qa/retest/.profile/`. If deletion is blocked, say so; the lead will
  remove it. Record the Chrome version.

## Target
- **URL:** `http://localhost:3100`, a production build of **checkpoint 7**.
  - `refs/checkpoints/design-v2-closeout-7` = `6587df1` (tree `a5810de`).
  - `.next-test/BUILD_ID` = `PSEDW6FZGKynViYaur0aY`.
  - Record both, plus `git rev-parse HEAD`, before and after testing.
- **Accounts:** synthetic `@flowline-qa.test` accounts through the UI; the outbox is at
  `curl "http://localhost:3100/api/test/outbox?email=<address>"`.

## Retest (reproduce your original steps from `artifacts/design-v2/BUGS.md` exactly, then check the expected behaviour)
- **Q01:** Arabic run UI shows the approval wait and the AI 401 failure in Arabic, and provider name/status/details
  are still present. Also spot-check one more code: a revoked connection, or AI rate-limit via a `429` fault.
- **Q02:** Escape (and Cancel/close) from the AI connection dialog returns focus to the trigger. Also check one other
  dialog (Connect in Integrations, or the re-run dialog).
- **Q03:** the English and Arabic landing page at 768, 1024, 1279, 1280 and 1440: no document overflow, and Start free
  fully visible.
- **Q04:** at 375 and 360, language and theme are switchable from the landing header, by touch-size targets and by
  keyboard.
- **Q05:** at 375, the run sheet is a named modal dialog, focus moves in and is trapped, Escape closes it, and focus
  returns sensibly.
- **V01:** output nodes have no square outer border, including selected and skipped states, in dark/light and EN/AR.
- **V02:** the Arabic sign-up illustration subtitles are Arabic.
- **V03:** `50+ employees?`-style step names keep their order in Arabic timelines and the run dock, desktop and phone.
- **L01:** landing switcher targets at least 32 px below 1280 px and at least 24 px from 1280 px; sign-in page
  switchers at least 24 px.
- **Regression glance** (not a full re-QA): sign-in, the dashboard, builder run, settings AI Providers, and the Arabic
  RTL shell look right, with no new console errors.

## Report
`artifacts/design-v2/chrome-qa/retest/REPORT.md` containing:
- the environment and identity;
- a table of each finding → **FIXED / NOT FIXED / PARTIAL / BLOCKED**, with evidence;
- any NEW defects, appended to BUGS.md as `DV2-Q06+` with severity, classification, repro, expected/actual, and the
  snapshot/BUILD_ID;
- what was not covered.
