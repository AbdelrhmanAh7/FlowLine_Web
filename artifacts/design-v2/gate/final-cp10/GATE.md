# Final cumulative gate: checkpoint 12

**PASS for the required automated gate. Test doubles only.** This retained `final-cp10` directory now contains the final cp12 results; cp10/cp11 runs are historical and not substituted for these counts. The exhaustive every-dialog exploratory sweep remains NOT RUN, as explicitly recorded in the Chrome report.

## Identity

- Checkpoint: `596c47066c07c2ce88df4b0eea928280de5a8063` (`refs/checkpoints/design-v2-closeout-12`).
- Checkpoint tree: `8b5e51ac2df2a26a101b11db261b6c5b5abca819`.
- Branch HEAD before the authorized local commit: `fb563e517263800062adf5d5a31af672ebcc4da3`.
- Before resuming QA and the gate, all ten execution inputs were rehashed through a temporary index and matched cp12; the real index stayed unchanged: `resume-identity.json`. `checkpoint-12.json` contains the baseline hashes. Only evidence/closeout records changed afterward.
- Every browser invocation rebuilt the same inputs through `../../closeout/run-with-stack.sh`. Therefore BUILD_ID differs by invocation; it is not a code-change indicator.

## Sequential browsers

| Browser | Result | BUILD_ID | Evidence |
|---|---|---|---|
| Chromium Windows | 109/109 PASS | `ECragj5lgsZXUvKlFTdjd` | `final-chromium/results.txt`, `stack-session.txt` |
| Firefox Linux (Docker) | 45/45 PASS | `Q_hQ8OJzHXu9LXAHraaQn` | `final-firefox/results.txt`, `stack-session.txt` |
| Webkit Linux (Docker) | 45/45 PASS | `9wh8O7Hg4FXxpojrPWgOF` | `final-webkit/results.txt`, `stack-session.txt` |

Order: Chromium, then Firefox, then WebKit, always `--workers=1`, `retries=0`. No other browser, exploration, build or test suite ran alongside a browser runner. Each wrapper records PID, ports, build ID, readiness, log and exact stop command; every successful invocation ended with the three test ports free. The only concurrent utility was the low-overhead memory sampler.

Firefox uses the existing `../../closeout/firefox-docker.sh` workaround for the previously evidenced native Windows launch exit 255. WebKit uses `e2e/tools/webkit-docker.sh`. Both use Playwright 1.63.0's official Linux image and the configured `@critical|@cross-browser` selection (45 cases), not the entire Chromium selection. These results do not claim Windows Firefox or Safari testing.

All 17 builder-keyboard cases pass in each browser here and in the earlier targeted cp12 runs under `keyboard/`. The earlier Chromium targeted 20/20 total comprises 17 keyboard plus 3 admin cases; Firefox and WebKit targeted totals are 17/17 each.

A preliminary Chromium command rejected the unsupported `--screenshot=off` CLI flag before tests began. The corrected launcher removed that flag; the admin spec already disables screenshots, traces and video. The launch error is preserved under `final-chromium/launch-error/` and is not a test retry or a passing result. There were no failed, skipped or flaky test cases in any completed final run.

## Stack stopped: non-browser gate

| Check | Result | Evidence |
|---|---|---|
| Lint | PASS, exit 0 | `non-browser/lint.txt` |
| Typecheck | PASS, exit 0 | `non-browser/typecheck.txt` |
| Unit | 388/388 PASS | `non-browser/test.txt` |
| Contract | 465/465 PASS | `non-browser/test-contract.txt` |
| Integration | 460/460 PASS | `non-browser/test-integration.txt` |
| Evidence scan | 5 local values, 720 files, 0 hits | `non-browser/check-evidence.txt` |

`non-browser/status.txt` records strict sequential order and exits; `stop.txt` plus the port guard precede the suites. The integration suite uses the isolated `flowline_test_dv2` database and refuses a running test-stack worker.

The scanner reads values in-process and emits counts only. It excludes images/compressed traces and short/fake values; zero text hits is not a binary-image audit or a live-security certification. The staged scan is repeated immediately before commit and recorded separately.

## Exploration, findings and resources

`../../chrome-qa/final-cp10/REPORT.md` reconciles the ten journeys individually: nine PASS; journey 9 NOT RUN for the literal exhaustive every-dialog sweep. Targeted M01/M02, Q05, focus, phone and reduced-motion acceptance checks passed. The admin-inclusive A-retest is 36/36, and B-resume 26/26. No cp8 observation is presented as cp12 evidence.

DV2-F01 is fixed and retested on cp12. Existing P3 findings remain open in BUGS.md. DV2-02's design-worktree replacement is supported by retained 10/10 crypto checks, zero old-key DB envelopes, the prior history-scan record and the current evidence scan. Other two test environments remain OPEN for the owner; no other env file was read or rotated here.

Memory: 132 samples, minimum available Windows memory 6795 MB, in `memory.csv` (Docker browser allocations are not included in the native browser-process column). The sampler was stopped after the browser gate. No detached test server remains.

No push, merge, deployment, release-scope change, live payment or worktree removal was performed. The local commit's execution-input mapping is recorded in the subsequent `../../closeout/HANDOFF.md`.
