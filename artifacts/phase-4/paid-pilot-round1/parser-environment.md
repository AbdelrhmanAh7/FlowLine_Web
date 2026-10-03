# L3 partial remediation — parser child environment

Base/tested HEAD: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; branch `codex/pilot-sandbox-env-round1`, isolated worktree `FL-wt-pilot-security-sandbox`. Tested source is a dirty uncommitted candidate; no new SHA claimed. Tool/model: Codex security worker, gpt-6.1-sol high.

The JSONata/PDF fork now receives only fixed `NODE_ENV=production`, plus Windows' explicitly required `SYSTEMROOT` OS installation path. Worker credentials, PATH, Node options/preloads, CA overrides, proxy settings and user/profile variables are excluded. Windows libuv automatically copies eleven omitted variables from the parent, so their values are explicitly blanked before spawn (SYSTEMROOT is then explicitly restored). [Primary libuv source](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c) documents this platform behavior. The working directory is the parser module's directory. Existing executable, heap limit, queue, timeout, IPC serialization and parsing behavior are retained.

A test-only parent API and child IPC branch return **nonempty variable names only**, never values. Both gates require an explicit test mode; the child receives only a fixed test-inspection flag. Actual production-child coverage proves the inspection operation is unavailable without that flag. User expression input cannot select the private IPC operation.

## Focused results

- Two unit files `sandbox-environment` and existing `sandbox`: **11 passed**, no skips. Four new actual-child cases prove parent credential/PATH/proxy/CA/preload canaries are absent, normal JSONata and valid PDF extraction work, and production-mode inspection is disabled. The nonexistent NODE_OPTIONS preload canary would prevent child startup if inherited.
- Existing seven assertions are unchanged: syntax/runtime errors, real hard timeout, bounded pad/memory failure with recovery, complete template execution and output-key validation.
- First run: **10 passed / 1 failed**. Real-child inspection caught libuv copying omitted Windows PATH/user/platform variables. Source now explicitly blanks libuv's default-copy list.
- Second run: **3 passed / 8 failed**. Blanking SYSTEMROOT broke Windows Node child startup (exit 134); the existing execution assertions caught it. Source now explicitly permits only that essential platform path, and the new environment contract names that documented platform exception. Final **11/11 passed**. Existing baselines were not changed and failures were not skipped or retried without a source correction.
- Full `tsc --noEmit --incremental false` and targeted ESLint (including explicit non-ignored child script lint): passed. No environment-file reads, provider calls, DB changes, Docker changes, browser/full gate or production build.

L3 remains **PARTIAL**: inherited environment exposure is reduced, but the child retains the worker's OS identity, filesystem and network authority. SYSTEMROOT is a platform runtime input, not a separate authority boundary. Dedicated lower-authority parsing/evaluation still needs file/network denial tests, synthetic marker confinement, valid PDF/JSONata behavior and wall-clock/heap limits. No parser RCE, complete isolation or paid-pilot readiness is claimed.
