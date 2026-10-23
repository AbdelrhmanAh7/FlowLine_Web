# Prep for #361: Follow-up from #358: non-blocking review findings

> Offline floor prep (2026-10-23T17:58Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=358 -->
Follow-up from #358 (fix: 124-signup-verify.e2e.ts: e2e-army/124-signup-verify.e2e.ts: delete this file. It duplicates 12… (split from #135) (#337)).

P2/P3 findings from the reviewers. They do not block #358 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] tests/unit/e2e-signup-verify-guard.test.ts:93: AC3 runs every signup-verify rule against every top-level e2e-army file. The exact `test@example.com` ban and the `/api/users/` ban are not limited to signup-verify tests; an unrelated e2e test that legitimately uses either string will fail the whole unit suite. Scope the rules to the signup/verify test(s) or add a narrow, documented allowlist.
- QA Second Opinion: [p2] tests/unit/e2e-signup-verify-guard.test.ts:103: The `<= 8` cap is hardcoded and is not part of issue #337 or tied to a checked-in policy/config. A legitimate ninth top-level e2e test will now fail this unit test. Derive the cap from the hub documentation/config, or remove the assertion if the cap is not an enforced project rule.
- QA Second Opinion: [p3] docs/evidence/337/EVIDENCE.md:20: AC5 says the negative control detects all five historical anti-patterns, but the command only `touch`es an empty file; the observed failures are AC2 and AC4, and an empty file has no anti-pattern content for AC3. The five-pattern detection comes only from AC1's fixture. Reword AC5 or run the guard against the real historical file.
- QA Second Opinion: [p3] tests/unit/e2e-signup-verify-guard.test.ts:11: This regex only catches dot-assignment mutations. A reintroduced test using `process.env['FLOWLINE_ENV'] = ...` or `Object.assign(process.env, ...)` bypasses the guard. Add those variants to the detector and the negative-control fixture.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - Issue #361: FlowLine Web - Non-Blocking Review Findings

**Objective:** Validate findings from P2/P3 reviews regarding the `e2e-signup-verify-guard` and related files.

**1. Signup/Verify Rule Scope (tests/unit/e2e-signup-verify-guard.test.ts:93)**
* **Name:** Verify Rule Scope Limitation
* **Setup:** Create a standard signup/verify e2e test.
* **Assertion:** Ensure the rule only triggers on signup/verify tests, not arbitrary e2e tests using the banned strings.
* **File:** tests/unit/e2e-signup-verify-guard.test.ts:93

**2.  Cap <= 8 (tests/unit/e2e-signup-verify-guard.test.ts:103)**
* **Name:** Verify Cap Derivation
* **Setup:** Run the test with a top-level e2e test that exceeds the cap.
* **Assertion:** The test fails as expected, demonstrating the hardcoded cap.
* **File:** tests/unit/e2e-signup-verify-guard.test.ts:103

**3. Regex Mutation Detection (tests/unit/e2e-signup-verify-guard.test.ts:11)**
* **Name:** Test Dot-Assignment Bypass
* **Setup:** Introduce `process.env['FLOWLINE_ENV'] = ...` in a top-level e2e test.
* **Assertion:** The guard detects the mutation.
* **File:** tests/unit/e2e-signup-verify-guard.test.ts:11

**4. AC5 Negative Control (docs/evidence/337/EVIDENCE.md:20)**
* **Name:** Verify AC5 Negative Control Accuracy
* **Setup:** Run the guard against the real historical file.
* **Assertion:** AC2 and AC4 failures are resolved.
* **File:** docs/evidence/337/EVIDENCE.md:20

**5.  ENV Variable Allowlist (General)**
* **Name:** Test Allowlist Implementation
* **Setup:** Add a specific, documented allowlist for a common environment variable.
* **Assertion:** The guard *passes* when the allowlist is present.
* **File:**  Multiple files (adjust guard logic)

**6. Edge Case: Empty File (AC5)**
* **Name:** Test Empty File Scenario
* **Setup:** Run the guard against an empty file.
* **Assertion:** The guard does not trigger.
* **File:** docs/evidence/337/EVIDENCE.md:20

**7.  .coderabbit.yaml Verification**
* **Name:** Verify .coderabbit.yaml Configuration
* **Setup:**  Inspect the .coderabbit.yaml file.
* **Assertion:** Ensure the configuration is valid and aligns with the documented requirements.
* **File:** .coderabbit.yaml

**8. Gate Selection Test (tests/unit/gate-selection.test.ts)**
* **Name:** Verify Gate Selection Logic
* **Setup:** Run the gate selection test.
* **Assertion:** The test passes as expected.
* **File:** tests/unit/gate-selection.test.ts
