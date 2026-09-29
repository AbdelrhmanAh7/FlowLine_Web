# FINAL merged browser gate: `ai-hub` @ `22de627`

**Code:** all 20 Codex review findings fixed (retest 3) + the Chrome QA fixes CXQ-01…04 + test fixes TEST-03/04/05.

**Setup:**
- single worker; one browser project at a time; retries 0;
- one `pnpm dev:test` stack, restarted once (restart proof + WebKit fake ports);
- test doubles only (**not** live cloud).

| Browser | Expected | Executed | Passed | Failed | Flaky | Skipped | Interrupted | Log |
|---|---|---|---|---|---|---|---|---|
| Chromium (all specs incl. `admin-panel` ×3) | 65 | 65 | 65 | 0 | 0 | 0 | 0 | `gate-chromium.txt` |
| Firefox (`@critical\|@cross-browser`) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `gate-firefox.txt` |
| WebKit (`@critical\|@cross-browser`, Docker) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `gate-webkit.txt` |

All three passed on the first attempt; no re-runs were needed for this revision.

**Restart persistence:** phase 1 and phase 2 passed. A key typed in the UI, then a full web + worker + fake restart,
then sign-in again: the masked hint was listed, and the provider received exactly that key.

**Non-browser gates on `22de627`:**
- lint and typecheck: clean.
- Unit 285, contract 465.
- Integration 460/460 twice.
