# Prep for #113: CodeQL triage C: insufficient password hash (#10, #12)

> Offline floor prep (2026-10-10T15:24Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (3 d 23 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Scope: src/server/rate-limit.ts (#12) and e2e/fakes/ai-protocols.ts (#10).
First determine whether the hashed value is really a password. If it is only a rate-limit key or a fake token, then either switch to HMAC-SHA-256 with a non-secret salt constant, or document it as a false positive with the reason. If it is a real password or secret, use scrypt or argon2 from existing dependencies, and add no new paid services. Test first: the rate-limit behaviour must stay identical.
Do not read, create or print any credentials. Write notes in docs/security/codeql-triage-hashing.md.
Acceptance: each alert is fixed or has a written dismissal reason, CI is green incl. docs, and the PR is under 300 lines.

Part 3/4 of #63 (split by the CTO: Split the 13 alerts into 4 small, independent PRs by file area. Each is under 300 lines and tests-first, and each runs the docs check locally before pushing.)

<!-- nql-cto-split parent=63 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/23-admin-write-only.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`
- `artifacts/ai-hub/chrome-qa-756d69c/browser-events.json`
- `artifacts/ai-hub/chrome-qa-756d69c/key-request-checks.json`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/artifact-audit.json`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/BRIEF.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case 1**: `rate-limit.ts` - Verify rate-limit key generation matches expected pattern.  
  Setup: Call rate-limit function with known inputs.  
  Assertion: Output matches regex for rate-limit key.

- **Test Case 2**: `rate-limit.ts` - Ensure rate-limit behavior remains unchanged after hash change.  
  Setup: Use old and new hash functions.  
  Assertion: Rate-limit counts and thresholds are identical.

- **Test Case 3**: `ai-protocols.ts` - Validate fake token generation.  
  Setup: Generate fake token with current logic.  
  Assertion: Token format and length match expected values.

- **Test Case 4**: `ai-protocols.ts` - Confirm fake token does not contain sensitive data.  
  Setup: Inspect generated token content.  
  Assertion: No identifiable user or system data is present.

- **Test Case 5**: `ai-protocols.ts` - Test token expiration logic.  
  Setup: Generate token with timestamp.  
  Assertion: Token is invalidated after configured timeout.

- **Test Case 6**: `ai-protocols.ts` - Ensure no credentials are logged or printed.  
  Setup: Monitor console output during token generation.  
  Assertion: No credentials or secrets appear in logs.

- **Test Case 7**: `rate-limit.ts` - Test rate-limit key uniqueness across users.  
  Setup: Generate keys for multiple users.  
  Assertion: Keys are unique per user and not reused.

- **Test Case 8**: `rate-limit.ts` - Validate rate-limit key length and entropy.  
  Setup: Measure key entropy and length.  
  Assertion: Key meets minimum entropy and length requirements.

- **Test Case 9**: `ai-protocols.ts` - Confirm token generation is deterministic.  
  Setup: Generate token with same inputs.  
  Assertion: Output is consistent across runs.

- **Test Case 10**: `ai-protocols.ts` - Test token validation against expected format.  
  Setup: Validate token against regex pattern.  
  Assertion: Token is accepted only if it matches the format.
