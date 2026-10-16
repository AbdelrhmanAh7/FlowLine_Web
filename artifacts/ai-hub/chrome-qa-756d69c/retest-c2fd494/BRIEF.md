# Codex: retest CXQ-05 in real Google Chrome on `ai-hub` (final product code `c2fd494`)

You are an independent tester. **Do NOT modify product code, tests or docs.** Write only under
`artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/`. Don't commit, and don't start, stop or rebuild servers,
containers or Docker.

## Target
- `http://localhost:3100` is the test stack (`FLOWLINE_ENV=test`), running as a **production build** (`next start`)
  of this worktree. Check `GET /api/health` first. It reports `revision: "dev"`, so record `git rev-parse HEAD` and
  confirm that `git diff c2fd494 HEAD -- src worker drizzle` is empty.
- Providers are **test doubles**: the AI fake is on `127.0.0.1:4011` and the SaaS fakes on `:4010`. Any key string
  works. Never present results as live cloud verification.
- Accounts: sign up through the UI with a fresh `@flowline-qa.test` address. The verification link is at
  `curl "http://localhost:3100/api/test/outbox?email=<address>"`.
- Use the same method as `../retest-22de627/RETEST.md`: real Google Chrome (Playwright `channel: "chrome"`, headed or
  headless), with the version verified. One browser session only. Close only the browser you launched.

## Retest
1. **CXQ-05** (the original steps are in `../retest-22de627/RETEST.md`, section "NEW CXQ-05"):
   - Connect OpenAI and discover `fake-gpt-large`.
   - Set workspace prices 2/8 and open AI Providers so the picker loads them.
   - Without reloading, go to Usage & limits, change the input price to 4 and save.
   - Go back to AI Providers in the same SPA session. The picker must now show the new price without a reload.
   - Compare with the read-only `GET /api/workspaces/<id>/ai/models`.
   - Run it in English and Arabic at 1440 px, plus one at 375 px.
2. **Regression spot-check on the same revision** (brief):
   - CXQ-02/03: the run inspector labels cost as `Cost (USD)` / `التكلفة (USD)`, with no raw `costMicros`.
   - CXQ-04: the usage table scrolls horizontally at 375 px, with no page-level horizontal scroll.
   - CXQ-01: Arabic provider prose appears on AI Providers.
3. Scan the console and network for errors, and search page HTML, storage and URLs for the raw key.

## Report
`RETEST.md` in this folder containing:
- the environment (the Chrome version, HEAD SHA, date);
- CXQ-05 **FIXED / NOT FIXED** with evidence;
- the regression table (PASS/FAIL);
- any new findings as `CXQ-06+` with P0–P3 severity and exact reproduction steps.

Screenshots go in `screenshots/`. No full keys, passwords or TOTP secrets in any file.
