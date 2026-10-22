# Evidence for Issue #112: CodeQL triage B - scripts/ alerts

**Branch:** `ai/112` | **Commit:** `28d71c0f` | **PR:** #333

---

## Acceptance Criteria Verification Report

| AC | Description | Verification Method | Evidence (Command / Test / Output) | Exit Code / Status |
|----|-------------|---------------------|-----------------------------------|-------------------|
| **AC1** | `npm test -- tests/unit/verify-beta-stack.test.ts tests/unit/stop-test-stack.test.ts` exits 0; both files assert exact argv arrays (not shell strings) | Run unit tests for both new test files | `pnpm test -- tests/unit/verify-beta-stack.test.ts tests/unit/stop-test-stack.test.ts` | ✅ **Exit 0** — 12/12 tests passed (6 verify-beta-stack, 6 stop-test-stack) |
| **AC2** | `resolveTlsPolicy(env, url)` returns certificate validation ON (no `NODE_TLS_REJECT_UNAUTHORIZED=0`, no `--insecure`) for every input except `BETA_STACK_ALLOW_INSECURE=1` with a loopback host; non-loopback refusal test passes | Unit test: `resolveTlsPolicy` keeps cert validation ON unless flag + loopback | `tests/unit/verify-beta-stack.test.ts` lines 21–28: tests for `{}`, `{BETA_STACK_ALLOW_INSECURE: "1"}` with non-loopback, and loopback targets | ✅ **Pass** — all assertions match expected `{ rejectUnauthorized: true, allowInsecure: false, env: {} }` for non-loopback; `{ rejectUnauthorized: false, ... }` only for loopback+flag |
| **AC3** | `stop-test-stack.mjs` invoked with PID env `"1234; rm -rf /"` or `"$(whoami)"` exits 1 with validation message on stderr and spawns zero child processes | Unit test: spawns script with malicious PID env, asserts exit 1 + stderr | `tests/unit/stop-test-stack.test.ts` lines 53–57: `it.each(["1234; rm -rf /", "$(whoami)"])("exits 1 on PID env %j with stderr validation error")` | ✅ **Pass** — `res.status === 1`, `res.stderr.includes("Invalid PID")` |
| **AC4** | Grep of both changed scripts shows no `exec(` with interpolated/template string, no `shell: true`, no `.replace(` used as input sanitization; every child process call passes an args array | Static grep verification | `grep -n "exec(" scripts/release/verify-beta-stack.mjs scripts/stop-test-stack.mjs` → no matches<br>`grep -n "shell: true" scripts/release/verify-beta-stack.mjs scripts/stop-test-stack.mjs` → no matches<br>`grep -n "\.replace(" scripts/stop-test-stack.mjs` → no matches | ✅ **Verified** — all three greps return no matches (exit 1 = no findings) |
| **AC5** | `docs/security/codeql-triage-scripts.md` exists with one row per in-scope alert (#8, #13, #4) with status Fixed/Dismissed and non-empty reason; local docs check exits 0 | File existence + content check + docs-check script | `cat docs/security/codeql-triage-scripts.md` → table with 3 rows (Fixed, reasons present)<br>`node -e 'import("./scripts/ci/docs-check.mjs")...'` → exit 0 | ✅ **Pass** — doc exists, 3 Fixed rows with reasons, docs check exits 0 |
| **AC6** | `git diff --stat` for PR reports at most 5 files and at most 300 changed lines | Git diff stat against base | `git diff 28d71c0f^..28d71c0f --stat` → 5 files, 263 insertions(+), 33 deletions(-) = **296 lines** | ✅ **Pass** — 5 files, 296 lines (< 300) |

---

## Changed Covering Tests

| Test File | Status | Covers |
|-----------|--------|--------|
| `tests/unit/verify-beta-stack.test.ts` | **NEW** | AC1, AC2 — `isLoopbackTarget`, `resolveTlsPolicy`, `buildVerifyArgs` |
| `tests/unit/stop-test-stack.test.ts` | **NEW** | AC1, AC3 — `validatePid`, `validatePort`, `validateStackName`, argv builders, injection rejection |

> Docs/chores exempt per instructions.

---

## Security Alert Dispositions (from docs/security/codeql-triage-scripts.md)

| Alert | Rule | File | Disposition | Reason |
|-------|------|------|-------------|--------|
| #4 | `js/incomplete-sanitization` | `scripts/stop-test-stack.mjs` | **Fixed** | Removed regex quote replacement (`ps.replace(/"/g, '\\"')`). Arguments passed directly as argv elements via `execFileSync` to PowerShell without shell interpolation. |
| #8 | `js/disabling-certificate-validation` | `scripts/release/verify-beta-stack.mjs` | **Fixed** | Certificate validation stays ON by default. Disabling restricted to local loopback hosts (`127.0.0.1`, `::1`, `localhost`) with explicit `BETA_STACK_ALLOW_INSECURE=1` for Caddy internal CA. Non-loopback targets rejected with exit 1. |
| #13 | `js/shell-command-injection-from-environment` | `scripts/stop-test-stack.mjs` | **Fixed** | Replaced `execSync` shell strings with `execFileSync` argv arrays (`shell: false`). Inputs validated with strict allowlists (`^[0-9]{1,7}$` > 1 for PIDs, 1..65535 for ports, `^[A-Za-z0-9_.-]{1,64}$` for stack names); invalid input exits 1 without spawning subprocesses. |

---

## Additional Verification

### Typecheck & Lint
```bash
pnpm typecheck   # Exit 0
pnpm lint        # Exit 0
```

### No Regression in Full Unit Suite
```bash
pnpm test  # 1823 passed | 1 skipped (all projects)
```

### Scripts Export Helpers (Testability)
- `scripts/release/verify-beta-stack.mjs` exports: `isLoopbackTarget`, `resolveTlsPolicy`, `buildVerifyArgs`
- `scripts/stop-test-stack.mjs` exports: `validatePid`, `validatePort`, `validateStackName`, `buildLsofArgs`, `buildFuserArgs`, `buildKillArgs`, `buildPowerShellArgs`, `buildStackArgs`

Both guarded by `import.meta.url === pathToFileURL(process.argv[1]).href` so imports don't execute script bodies.

---

## E2E Gate

**Not applicable** — this PR is pure refactor / security hardening of internal scripts (no user-facing flow). Per AGENTS.md: "E2E: not needed — internal scripts and security hardening only (no user-facing flow)." No e2e-army test added.

---

## Summary

All 6 acceptance criteria **verified and passing**. The implementation:
- Fixes all 3 in-scope CodeQL alerts (#4, #8, #13) with code changes
- Adds comprehensive unit tests covering validators, argv builders, and injection payloads
- Documents dispositions with rationale in `docs/security/codeql-triage-scripts.md`
- Stays within 300-line limit (296 lines, 5 files)
- Passes typecheck, lint, docs-check, and full unit test suite