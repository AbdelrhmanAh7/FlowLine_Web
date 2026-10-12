# Prep for #62: Dependabot alert #3: source-map-js (high, GHSA-68fv-2mgg-jv7q) — update pnpm-lock.yaml to ≥1.2.2

> Offline floor prep (2026-10-12T12:40Z): capacity 0 — claude: claude daily budget spent (15% of 4.4% week-points; codex: held until 12:47Z (codex 5-h 100% used (codex app-; opencode: held until 13:05Z (opencode rate-limited 11× in a ; agy: held until 10-14 14:36Z (2 d 2 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Found while recording evidence for #24 (PR #59): the repository has one open Dependabot alert.

- Package: `source-map-js` (transitive, `pnpm-lock.yaml`), severity **high**, advisory GHSA-68fv-2mgg-jv7q, first patched version 1.2.2.
- Alert: https://github.com/AbdelrhmanAh7/FlowLine_Web/security/dependabot/3

What to do (`docs/security/REPO_SECURITY_SETTINGS.md`, "Dependabot alert"): bump the lockfile entry in a normal tracked PR (`pnpm update`, or a `pnpm.overrides` entry if a parent package pins it), keep the PR small, run the fast tier, and update the docs in the same PR. Dependabot security-update PRs are off on purpose (CodeRabbit budget), so this is a manual fix.

Acceptance: alert #3 is closed as fixed, and `gh api repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open --jq length` returns 0 (or only alerts newer than this issue).


## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/gate-cceeb5d/webkit-attempt1-failure/error-context.md`
- `artifacts/ai-hub/gate-e1a479b/chromium-attempt1-failure/error-context.md`
- `artifacts/ai-hub/gate-final-c2fd494/firefox-attempt1-failure/error-context.md`
- `artifacts/ai-hub/research/providers-2026-09-29.md`
- `artifacts/ai-hub/wavec-84f2cc1/BUGS.md`

## Existing tests nearby

- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Dependabot Alert - source-map-js

**Objective:** Verify the fix for the `source-map-js` vulnerability.

**1. Lockfile Update Verification:**
   * **Name:** pnpm Lockfile Integrity
   * **Setup:** `pnpm install` after manual update.
   * **Assertion:** `pnpm-lock.yaml` version is ≥ 1.2.2.
   * **File:** `pnpm-lock.yaml`

**2. Dependency Tree Impact:**
   * **Name:** Transitive Dependency Check
   * **Setup:** `pnpm list --depth=5`
   * **Assertion:** `source-map-js` version is 1.2.2 or higher across the dependency tree.
   * **File:** N/A (command output)

**3. CI/CD Pipeline Verification:**
   * **Name:** CI Build Success
   * **Setup:** Trigger a CI build (e.g., nightly).
   * **Assertion:** Build completes successfully without errors related to `source-map-js`.
   * **File:** `.github/workflows/*`

**4. Docs Update Verification:**
   * **Name:** Documentation Consistency
   * **Setup:** Review `docs/security/REPO_SECURITY_SETTINGS.md`
   * **Assertion:** Updated documentation reflects the fix.
   * **File:** `docs/security/REPO_SECURITY_SETTINGS.md`

**5. Edge Case - Pinning:**
   * **Name:** Overrides Test
   * **Setup:** Create a `pnpm.overrides` entry to force 1.2.2.
   * **Assertion:** `pnpm install` updates the lockfile.
   * **File:** `pnpm.overrides`

**6. Alert Status Verification:**
   * **Name:** Dependabot Alert Status
   * **Setup:** `gh api repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open --jq length`
   * **Assertion:** Returns 0.
   * **File:** N/A (command output)

**7. Test Script Execution:**
   * **Name:** Docs Check Script
   * **Setup:** Run `tests/unit/docs-check-script.test.ts`
   * **Assertion:** All tests pass.
   * **File:** `tests/unit/docs-check-script.test.ts`
