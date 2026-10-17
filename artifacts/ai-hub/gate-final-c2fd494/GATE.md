# FINAL browser gate: `ai-hub` @ `c2fd494` (the final product code)

Code: all 20 Codex findings fixed, CXQ-01…05 fixed, TEST-03/04/05. Single worker, one browser project at a time,
retries 0, test doubles only (**not** live cloud).

## A. Development test stack (`next dev`)

| Browser | Expected | Result | Log |
|---|---|---|---|
| Chromium | 66 | 66/66 | `gate-chromium.txt` |
| Firefox, attempt 1 | 24 | **23/24**: `phase3:42` members invite never produced its link | `gate-firefox-attempt1-1failed.txt`, `firefox-attempt1-failure/` |
| Firefox, attempt 2 | 24 | **23/24**: `phase3:102` API keys, revealed key never appeared. The trace was overwritten before it was saved (lost) | `gate-firefox-attempt2.txt` |
| WebKit | 24 | **23/24**: `phase3:102` API keys, `page.goto` never reached load | `gate-webkit.txt` |
| Restart proof | — | passed (phase 1 + 2) | `restart-proof-phase*.txt` |

## B. Production build of the same code (`FLOWLINE_TEST_NEXT=start`: `next build` + `next start`, same fakes, worker, DB)

| Browser | Run 1 | Run 2 | Log |
|---|---|---|---|
| Chromium | **66/66** (3.5 min) | — | `prod-build/gate-chromium.txt` |
| Firefox | **24/24** (1.6 min) | **24/24** | `prod-build/gate-firefox.txt`, `gate-firefox-run2.txt` |
| WebKit | **24/24** (1.9 min) | **24/24** | `prod-build/gate-webkit.txt`, `gate-webkit-run2.txt` |

All first attempt; no failures in 5 production-build suite runs.

## INTERMITTENT-02: classification
- **Symptom:** occasional Settings-page stalls on the dev test stack only:
  - an invite link or revealed key never appears;
  - or `page.goto` never reaches load.
- **Seen:** Phase 4 once (members, Firefox) and here 3×. Isolated re-runs pass (members 5/5).
- **Refuted application hypotheses.** A deterministic diagnostic with JS chunks delayed 0.8 s and 2.5 s, in Firefox and
  Chromium, showed:
  1. text typed before hydration is kept, and the submit works;
  2. a submit click landing before hydration still sends the POST and reveals the key.
- **Supporting evidence:**
  - The WebKit trace (`gate-cceeb5d`) showed exactly one JS chunk with no response while the server answered in
    58 ms, and the chunk served normally afterwards.
  - The production build ran 0 failures in 5 full suite runs, with Firefox and WebKit at about half the duration.
- **Conclusion (evidence-backed, not proven):** a dev-server (on-demand compile / request stall) artifact, not an
  application defect. It stays OPEN as a test-infrastructure issue.
- **Recommendation:** run release E2E against the production build (`FLOWLINE_TEST_NEXT=start`).
