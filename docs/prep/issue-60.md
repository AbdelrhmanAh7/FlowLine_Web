# Prep for #60: Post-merge: CI red after #54

> Offline floor prep (2026-10-12T10:12Z): capacity 0 — claude: claude daily budget spent (14% of 4.4% week-points; codex: held until 12:47Z (codex 5-h 100% used (codex app-; opencode: held until 10:26Z (opencode rate-limited 8× in a r; agy: held until 10-14 14:36Z (2 d 4 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

### 🔴 Post-merge: CI red after #54

> [!CAUTION]
> After merging PR #54 ("ci(ai-implementers): run 24/7, free engines first") the default branch CI is red at f655e51. Failing checks: start. Fix on a new branch; do not revert unless the fix is not possible in one PR.

#### Failing lines
- (no log lines captured — open the checks on the commit)

<details><summary><b>Context</b></summary>

| | |
|---|---|
| **Merge commit** | https://github.com/AbdelrhmanAh7/FlowLine_Web/commit/f655e51caf115e0313fba01c452d5e158176f5b9 |
| **PR** | https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/54 |

</details>

<sub>Follow-up Manager · Mac mini hub</sub>

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BUGS.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`

## Existing tests nearby

- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: CI Red After Merge #54

**Objective:** Investigate and confirm the fix for the CI failure introduced by merging PR #54.

**1. Verify CI Success (Critical)**
   * **Name:** CI Success Verification
   * **Setup:**  Run the CI pipeline on the `f655e51` commit.
   * **Assertion:** CI build passes with all checks green.
   * **File:** `.github/workflows/gate.yml` (Monitor pipeline execution)

**2. Test Gate Group Selection (High)**
   * **Name:** Gate Group Selection - Valid Input
   * **Setup:**  Ensure the gate group selection logic functions correctly with valid input data.
   * **Assertion:**  Correct gate group is selected based on defined criteria.
   * **File:** `tests/unit/gate-groups.test.ts`

**3. Test Gate Selection (High)**
   * **Name:** Gate Selection - Single Gate
   * **Setup:**  Verify single gate selection process.
   * **Assertion:**  Correct gate is selected.
   * **File:** `tests/unit/gate-selection.test.ts`

**4. .env.example Validation (Medium)**
   * **Name:** .env.example Configuration
   * **Setup:**  Inspect `.env.example` for correct environment variable settings.
   * **Assertion:**  All required environment variables are present and have valid values.
   * **File:** `.env.example`

**5.  .coderabbit.yaml Validation (Low)**
   * **Name:** .coderabbit.yaml Configuration
   * **Setup:** Inspect .coderabbit.yaml for correct configuration.
   * **Assertion:** All required configuration is present and valid.
   * **File:** .coderabbit.yaml

**Edge Cases:**
*   Invalid input data for gate selection (e.g., non-numeric values).
*   Missing environment variables in `.env.example`.
*   Different Gate Group configurations.
