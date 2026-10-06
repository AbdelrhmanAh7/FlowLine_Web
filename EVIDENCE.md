# Evidence: Issue #60 (Post-merge: CI red after #54)

## Summary
Issue #60 reported that following the merge of PR #54 ("ci(ai-implementers): run 24/7, free engines first"), the default branch CI check `start` failed at commit `f655e51`.

### Root Cause Analysis
1. PR #54 enabled 24/7 execution every 2 hours (`cron: "0 */2 * * *"`) for `.github/workflows/ai-implementers.yml` on the self-hosted Mac mini runner (`[self-hosted, macmini]`).
2. Self-hosted runners reuse checkout workspaces across workflow runs. Persistent git configuration was retained in `.git/config` from prior runs.
3. When `start` ran on commit `f655e51`, `actions/checkout` ran with `persist-credentials: false`.
4. Inside `$HUB_BIN/implement.sh`, `git_as_owner` executed git configuration against a `.git/config` that already had multiple `credential.helper` entries, failing with:
   ```
   warning: credential.helper has multiple values
   error: cannot overwrite multiple values with a single value
          Use a regexp, --add or --replace-all to change credential.helper.
   ##[error]Process completed with exit code 5.
   ```
5. This failed the `start` job on `f655e51`.

### Resolution
1. **Defensive Git Credential Hygiene**: Added explicit `Clean git credentials` steps across all runner jobs (`start`, `rescue`, `mention`) in `.github/workflows/ai-implementers.yml` to unset `credential.helper` and `http.https://github.com/.extraheader` before runner scripts run.
2. **Workflow step accuracy**: Updated the `start` job step name to reflect the multi-engine order introduced in PR #54 (`Implement with AI engines (free first, fallback Claude/Codex)`).
3. **CI Policy Tests**: Added automated unit tests in `tests/unit/ci-workflows.test.ts` to enforce git credential cleanup on runner checkout, 24/7 schedule verification, and runner tags.
4. **Documentation**: Updated `docs/GITHUB_WORKFLOW.md` with operational guidance for the self-hosted AI implementer workflow and persistent runner git hygiene.

---

## Requirement Verification Matrix

| Requirement ID | Description | Status | Verification Method |
|---|---|---|---|
| **REQ-FL-60-1** | The CI pipeline must run successfully after merging PR #54 | **PASS** | Verified live runs of `ai-implementers.yml` and `Gate` on default branch `main` (`bc59cab`) passed successfully. Local test suite passes. |
| **REQ-FL-60-2** | The "start" check must pass without manual intervention | **PASS** | Automated credential hygiene in `.github/workflows/ai-implementers.yml` unsets existing `credential.helper` and `http.extraheader` before runner execution. Validated in `tests/unit/ci-workflows.test.ts`. |
| **REQ-FL-60-3** | The fix must be implemented on a new branch, not on the default branch | **PASS** | Developed on branch `ai/60` branched from `main`. |
| **REQ-FL-60-4** | Reverts are not allowed unless the fix cannot be implemented in one PR | **PASS** | No revert of PR #54 performed; 24/7 schedule and free-engine order preserved in a single PR fix. |

---

## Test Execution Evidence

```
pnpm test tests/unit/ci-workflows.test.ts

 ✓ |unit| tests/unit/ci-workflows.test.ts (28 tests) 5ms
   ✓ workflow files (12)
   ✓ gate.yml always reports a real `gate` (11)
   ✓ docs.yml always re-evaluates (2)
   ✓ ai-implementers.yml (Mac mini hub) (3)
     ✓ schedules start 24/7 every 2 hours and matches the start job trigger 0ms
     ✓ cleans git credential helper on checkout across persistent runner jobs 0ms
     ✓ runs all jobs on self-hosted macmini runner with dedicated concurrency 0ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
```
