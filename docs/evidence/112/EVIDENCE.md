# Evidence: Issue #112 (CodeQL triage B in scripts/)

| AC | Requirement | Verification Method & Command | Exit Code / Result |
|---|---|---|---|
| **AC1** | Unit tests assert exact argv arrays and exit 0 | `pnpm vitest run tests/unit/verify-beta-stack.test.ts tests/unit/stop-test-stack.test.ts` | ✅ **Exit 0** (all tests pass) |
| **AC2** | TLS validation ON unless `BETA_STACK_ALLOW_INSECURE=1` + loopback; non-loopback refused | `tests/unit/verify-beta-stack.test.ts` (unit + CLI spawn tests exit 1 on non-loopback) | ✅ **Pass** (`rejectUnauthorized: true` default, exit 1 refusal on non-loopback) |
| **AC3** | `stop-test-stack.mjs` with malicious PID env exits 1 with stderr message and spawns 0 subprocesses | `tests/unit/stop-test-stack.test.ts` (`FLOWLINE_TEST_PID="1234; rm -rf /"` spawns 0, stderr: "Invalid PID") | ✅ **Pass** (exit 1 on injection, ambient generic `PID` ignored) |
| **AC4** | No `exec(` shell string, no `shell: true`, no `.replace(` sanitization in changed scripts | `tests/unit/stop-test-stack.test.ts` static inspection assertions | ✅ **Pass** (only `execFileSync` with discrete argv) |
| **AC5** | `docs/security/codeql-triage-scripts.md` exists with #4, #8, #13 dispositions; docs check exits 0 | `scripts/ci/docs-check.mjs` via node | ✅ **Exit 0** (code: 4 files, docs: 2 files) |
| **AC6** | PR diff stays under 300 changed lines | `git diff origin/main..HEAD --stat` | ✅ **Pass** (< 300 changed lines) |

Covering tests: `tests/unit/verify-beta-stack.test.ts`, `tests/unit/stop-test-stack.test.ts`.
Resolutions: generic `PID`/`STACK_NAME` ignored; exported helper surface area strictly tested and bounded; entrypoint isolation verified behind `import.meta.url` guard.
