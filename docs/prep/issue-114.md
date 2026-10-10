# Prep for #114: CodeQL triage D: e2e fake servers (#5, #6, #7, #9)

> Offline floor prep (2026-10-10T18:39Z): capacity 0 — claude: claude daily budget spent (14% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 20:43Z (opencode rate-limited 7× in a r; agy: held until 10-14 14:35Z (3 d 20 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Scope: e2e/fakes/provider-server.ts (#5 stack-trace-exposure, #6 regex-injection, #9 server-side-unvalidated-url-redirection) and e2e/fakes/ai-server.ts (#7 resource-exhaustion).
Fix: #5 return a generic error body and log the stack server-side. #6 escape user input before building a RegExp, or use string matching. #9 allowlist redirect targets (relative paths or known local hosts). #7 add a request body size cap and a timeout or rate limit. Add contract tests in tests/contract/codeql-fakes.test.ts, written first. Write notes in docs/security/codeql-triage-fakes.md.
Acceptance: each alert is fixed or has a written dismissal reason, the existing e2e fakes still work, CI is green incl. docs, and the PR is under 300 lines.

Part 4/4 of #63 (split by the CTO: Split the 13 alerts into 4 small, independent PRs by file area. Each is under 300 lines and tests-first, and each runs the docs check locally before pushing.)

<!-- nql-cto-split parent=63 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.github/ci/env.test.template`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/02-connect-en.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/03-unknown-price-refusal.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/04-openai-inspector.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/05-anthropic-inspector.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/08-copilot-preview.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/11-rotation-impact.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/13-fallback-policy.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/14-retry-inspector.txt`
- `artifacts/ai-hub/chrome-qa-756d69c/15-fallback-used.txt`

## Existing tests nearby

- `e2e/tools/webkit-env.mjs`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case 1**: `Generic Error Response`  
  **File**: `e2e/fakes/provider-server.ts`  
  **Setup**: Send a request that triggers #5.  
  **Assertion**: Response body is a generic error, no stack trace exposed.  

- **Test Case 2**: `Regex Injection Prevention`  
  **File**: `e2e/fakes/provider-server.ts`  
  **Setup**: Send a request with user input in a regex pattern.  
  **Assertion**: Server rejects request, no RegExp injection occurs.  

- **Test Case 3**: `Valid Redirects Only`  
  **File**: `e2e/fakes/provider-server.ts`  
  **Setup**: Send a request with a redirect to an unallowed domain.  
  **Assertion**: Server blocks redirect, logs warning.  

- **Test Case 4**: `Rate Limiting`  
  **File**: `e2e/fakes/ai-server.ts`  
  **Setup**: Send excessive requests to trigger rate limit.  
  **Assertion**: Server returns 429 Too Many Requests.  

- **Test Case 5**: `Request Size Cap`  
  **File**: `e2e/fakes/ai-server.ts`  
  **Setup**: Send a request with a body exceeding size limit.  
  **Assertion**: Server returns 413 Payload Too Large.  

- **Test Case 6**: `Contract Test for Fakes`  
  **File**: `tests/contract/codeql-fakes.test.ts`  
  **Setup**: Run all contract tests for fakes.  
  **Assertion**: All tests pass, no regressions.  

- **Test Case 7**: `Docs CI Check`  
  **File**: `.github/ci/env.test.template`  
  **Setup**: Run docs CI check locally.  
  **Assertion**: Docs build successfully, no errors.  

- **Test Case 8**: `Existing Fakes Still Work`  
  **File**: `e2e/tools/webkit-env.mjs`  
  **Setup**: Run existing e2e fakes.  
  **Assertion**: All fakes function as expected.  

- **Test Case 9**: `Env Config Tests`  
  **File**: `tests/unit/zitadel-env-config.test.ts`  
  **Setup**: Run env config unit tests.  
  **Assertion**: All env config tests pass.  

- **Test Case 10**: `CI Green Check`  
  **File**: `.github/ci/env.test.template`  
  **Setup**: Push PR and check CI status.  
  **Assertion**: CI passes, no failures.
