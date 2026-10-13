# Prep for #218: README: document the in-CI e2e-army job (budget is now timed in CI) (part of #85)

> Offline floor prep (2026-10-13T11:16Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex pacing: not enough room for a coding run (~1; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:35Z (1 d 3 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #85

Delegated by the tech lead (Claude opus) of #85 to the team (Codex / free / local engineers).

**Files:** `README.md`

**Acceptance:** Code against this interface: .github/workflows/gate.yml gets a job with id `e2e-army` and check name `e2e-army`, `timeout-minutes: 5`, a matrix over the shards smoke, core-api, flows-api, runs, triggers, schedule and the ui-* shards, and each matrix leg runs `pnpm e2e:army --shard-id <shard>` against the test stack. In README.md lines 139 and 153, remove both 'not yet timed in CI' phrases and say 

**Test command:** `pnpm lint && grep -c 'not yet timed in CI' README.md | grep -qx 0`

Keep the change <= 100 lines; do not touch the parent's core logic.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/pull_request_template.md`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`

## Existing tests nearby

- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Issue #218 - e2e-army CI Job Documentation

**Goal:** Verify README.md accurately reflects the `e2e-army` CI job, specifically the timed budget.

**Test Cases:**

1.  **Verify Timeout:**
    *   **Setup:** Run `pnpm lint && grep -c 'not yet timed in CI' README.md | grep -qx 0`
    *   **Assertion:** Output should return `0`, confirming the phrase is removed.
    *   **File:** `README.md`
2.  **Shard Matrix Verification:**
    *   **Setup:** Manually review lines 139 & 153 of `README.md` to confirm the shard matrix is accurately described.
    *   **Assertion:**  Matrix details align with `.github/workflows/gate.yml`.
    *   **File:** `README.md`
3.  **Command Verification:**
    *   **Setup:**  Verify `pnpm e2e:army --shard-id <shard>` is the correct command executed within the matrix.
    *   **Assertion:**  Command matches the CI job definition.
    *   **File:** `README.md`
4.  **Edge Case - Shard ID:**
    *   **Setup:**  Test with a valid, but unusual, shard ID (e.g., "shard-999").
    *   **Assertion:**  The command executes without errors.
    *   **File:** `README.md` (Documentation)
5.  **Timeout Duration:**
    *   **Setup:**  Inspect `.github/workflows/gate.yml` to confirm `timeout-minutes: 5` is set.
    *   **Assertion:**  Timeout duration is correctly documented in `README.md`.
    *   **File:** `README.md`
