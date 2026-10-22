# CodeQL triage B: scripts/ alerts (issue #112, part 2/4 of #63)

Scope: the three CodeQL alerts under `scripts/` (#8, #13, #4). All three are fixed in code.

| Alert | Rule | File | Disposition | Reason |
|---|---|---|---|---|
| #4 | `js/incomplete-sanitization` | `scripts/stop-test-stack.mjs` | Fixed | Removed regex quote replacement (`ps.replace(/"/g, '\\"')`). Arguments are passed directly as argv elements via `execFileSync` to PowerShell without shell interpolation. |
| #8 | `js/disabling-certificate-validation` | `scripts/release/verify-beta-stack.mjs` | Fixed | Certificate validation stays ON by default. Disabling validation is restricted exclusively to local loopback hosts (`127.0.0.1`, `::1`, `localhost`) with explicit `BETA_STACK_ALLOW_INSECURE=1` for Caddy internal CA. Non-loopback targets are rejected with an explicit refusal and exit 1. |
| #13 | `js/shell-command-injection-from-environment` | `scripts/stop-test-stack.mjs` | Fixed | Replaced `execSync` shell strings with `execFileSync` argv arrays (`shell: false`). Inputs are validated with strict allowlists (`^[0-9]{1,7}$` > 1 for PIDs, 1..65535 for ports, `^[A-Za-z0-9_.-]{1,64}$` for stack names); invalid input exits 1 without spawning subprocesses. |

## Rationale for TLS validation policy (alert #8)

`scripts/release/verify-beta-stack.mjs` verifies the beta stack (P4-11). Real domains must validate Let's Encrypt certificates. During local dry runs against Caddy's internal CA:
1. Validation is ON by default (`rejectUnauthorized: true`).
2. Setting `NODE_TLS_REJECT_UNAUTHORIZED = "0"` requires `isLoopbackTarget(targetUrl)` AND `BETA_STACK_ALLOW_INSECURE=1`.
3. Non-loopback targets with insecure flags abort with exit code 1 and a refusal message.

## Command execution and input validation (alerts #4 & #13)

`scripts/stop-test-stack.mjs` previously used `execSync` with template string interpolation. The fix:
1. Strict validators: `validatePid(pid)`, `validatePort(port)`, `validateStackName(name)`.
2. Discrete argv subprocess calls via `execFileSync`: `buildLsofArgs`, `buildKillArgs`, `buildFuserArgs`, and `buildPowerShellArgs`.
3. Execution guarded with `import.meta.url === pathToFileURL(process.argv[1]).href`; helpers are pure functions for testability without side effects.
4. Input validation for `FLOWLINE_TEST_PID` fails closed on injection payloads without killing arbitrary ambient PIDs. Generic ambient `PID` and `STACK_NAME` are ignored.

## Verification

```sh
pnpm test tests/unit/verify-beta-stack.test.ts tests/unit/stop-test-stack.test.ts
node -e 'import("./scripts/ci/docs-check.mjs").then(m => m.checkDocs(["scripts/release/verify-beta-stack.mjs", "scripts/stop-test-stack.mjs", "tests/unit/verify-beta-stack.test.ts", "tests/unit/stop-test-stack.test.ts", "docs/security/codeql-triage-scripts.md"]))'
```
