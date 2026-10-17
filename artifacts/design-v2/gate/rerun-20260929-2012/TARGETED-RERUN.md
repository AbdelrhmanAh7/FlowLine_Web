# Controlled rerun of the 29 interrupted / unexecuted Chromium tests (design-v2)

**This is a targeted result, not a browser gate.** The full gate is recorded separately.

## Snapshot identity
- **Branch HEAD:** `design-v2` @ `fb563e5`, unchanged. The work under test is uncommitted and preserved in local refs.

| Checkpoint | Ref | Commit | Tree | Content |
|---|---|---|---|---|
| 1 | `refs/checkpoints/design-v2-20260929-e2e-rerun` | `6c53051` | `a3d7ae0` | The working tree at the interrupted run. |
| 2 | `refs/checkpoints/design-v2-20260929-e2e-rerun-2` | `741f379` | `3d12433` | Checkpoint 1 plus the `E2E_SCREENSHOT_DIR` override in `e2e/responsive.spec.ts` (captures only; no assertion or baseline change). Batch A ran on this. |
| 3 | `refs/checkpoints/design-v2-20260929-e2e-rerun-3` | `7f98337` | `cf57219` | Checkpoint 2 plus the DV2-01 test synchronisation fix in `e2e/phase2.spec.ts`; code is otherwise identical. Batches B and C and the DV2-01 retest ran on this. |

- `.env.test` is gitignored and absent from every checkpoint.
- **Build:** the production build (`FLOWLINE_TEST_NEXT=start`, `next build` + `next start`), BUILD_ID `Nzpo9ICHJUYXqfrEtXerH`, built 20:13 from checkpoint 2's `src/`. `src/` is identical in checkpoint 3.
- **Stack:** one stack (next start, worker, fakes on :4010/:4011, DB `flowline_test_design`), readiness confirmed by
  `/api/health?require=worker` before any browser opened. Playwright reused it (`reuseExistingServer`).

**DV2-02 (see `../../BUGS.md`):** the checkpoint commits were later rebuilt to redact a test key from a helper log. The mapping is 1 `6c53051`→`17b9160`, 2 `741f379`→`0f14e6b`, 3 `7f98337`→`09a1fbe`. The code trees are unchanged: `src` `8ae6b7a`, `e2e` `9f928be` (cp3), `tests` `b24fd40`.

## Selection
- **Tests:** the 29 tests marked `x` (9) or `-` (20) in `../e2e-chromium-2.txt`. `verify-selection.cjs` checks
  expected vs selected by file and title: 29 / 29, 0 missing, 0 extra.
- **Line numbers:** `responsive.spec.ts` lines are +1 against the interrupted run (the comment line of the override).

## Results (headless Chromium, `--workers=1`; each batch reports "using 1 worker")

| Batch | Snapshot | Expected | Executed | Passed | Failed | Interrupted | Log / JSON |
|---|---|---|---|---|---|---|---|
| A | cp2 | 7 | 7 | 6 | 1 (DV2-01, `phase2.spec.ts:200`) | 0 | `batch-A.txt`, `results-A.json` |
| B | cp3 | 11 | 11 | 11 | 0 | 0 | `batch-B.txt`, `results-B.json` |
| C | cp3 | 11 | 11 | 11 | 0 | 0 | `batch-C.txt`, `results-C.json` |
| A retest (DV2-01 only) | cp3 | 1 | 1 | 1 | 0 | 0 | `batch-A-retest.txt`, `results-A-retest.json` |

- **Overall:** 29 of 29 executed. 28 passed first time. 1 failed under stable conditions, was diagnosed as a test defect, was fixed in the test (see `../../BUGS.md`, DV2-01) and passed on retest. No crashes, no flaky results, no retries (`retries: 0`).
- **DV2-01 earlier:** it also failed, with the same error at the same line, in the interrupted run. It was not a crash artefact there either.
- **Covers:**
  - the Copilot button name: `phase3:222`, `phase3:274`, `responsive:231`;
  - disabled-on-mobile: `phase3:274`, `responsive:93`;
  - pending approvals: `phase3:346`;
  - both motion specs: `reduced-motion:9`, `run-states:13`.

## Resources (`memory.csv`, sampled every 5 s)

| Measure | Value |
|---|---|
| Pre-build | 16.6 GB available, 28.4 / 54.5 GB committed |
| Build peak (20:14:00) | 11.9 GB available, 33.7 GB committed, 34 test node processes (3.1 GB private) |
| During browser batches | at least 14.7 GB available, at most 30.7 GB committed, Playwright browser at most 438 MB private |
| Before each batch | at least 15.7 GB available, 0 leftover Playwright browser processes |
| WSL2 (`.wslconfig`) | memory=4GB, swap=4GB. PostgreSQL only; the staging containers are the owner's and were left running. |

## Evidence routing
- **Captures:** 59 files in `screenshots/`.
- **Phase 3 evidence:** `artifacts/phase-3/screenshots` unchanged (0 git changes).
