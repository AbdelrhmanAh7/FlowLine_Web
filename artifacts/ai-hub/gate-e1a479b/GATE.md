# Final merged browser gate: `ai-hub` @ `756d69c`

**Product code** (`src`, `worker`, `drizzle`, `scripts`) is identical to `a0b92df`, the revision Codex retest 3
accepted: all 20 product findings FIXED. Commits after it change tests and evidence only. The run started as
`e1a479b`; TEST-04 (a test-only fix) produced `756d69c`.

Setup:
- single worker; one browser project at a time; retries 0;
- one `pnpm dev:test` stack, restarted once for the restart proof and the WebKit fake ports;
- test doubles only (**not** live cloud).

| Browser | Expected | Executed | Passed | Failed | Flaky | Skipped | Interrupted | Log |
|---|---|---|---|---|---|---|---|---|
| Chromium, attempt 1 (`e1a479b`) | 65 | 65 | 64 | **1** | 0 | 0 | 0 | `gate-chromium-attempt1-1failed.txt`, `chromium-attempt1-failure/` |
| Chromium, attempt 2 (`756d69c`, complete suite) | 65 | 65 | 65 | 0 | 0 | 0 | 0 | `gate-chromium-attempt2.txt` |
| Firefox (`756d69c`) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `gate-firefox.txt` |
| WebKit (`756d69c`) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `gate-webkit.txt` |

**Coverage:**
- `admin-panel.spec` (×3) runs in Chromium only.
- Firefox and WebKit run the `@critical` / `@cross-browser` subset (intentional config difference).

## Chromium attempt 1 failure: TEST-04 (test defect, fixed)
- **Test:** `phase2.spec.ts:80` (template journey). `pickConnection` read the drawer's options once, immediately, and
  found no connection.
- **Evidence** (`chromium-attempt1-failure/trace.zip`):
  - both OAuth connects completed (`/integrations?oauth=connected&connection=…` for Sheets and Slack);
  - the drawer snapshot taken slightly later shows "Choose a connection", the label used only when connections exist.
- **Cause:** the one-shot read raced the asynchronous connections query under full-suite load.
- **Fix:** `expect.poll` until a real option exists (`756d69c`). The test passed 3/3 alone before the fix and in the
  complete suite after it.

## Restart persistence
Phase 1 and phase 2 passed: a key typed in the UI, then a full web + worker + fake restart, then sign-in again. The
masked hint was listed and the provider received exactly that key.

## Non-browser gates
On `e1a479b` (same product code as `756d69c`):
- lint and typecheck: clean.
- Unit 247, contract 465.
- Integration 460/460 twice.
