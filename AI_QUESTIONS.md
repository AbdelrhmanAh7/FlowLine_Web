# Issue #221 — implementation boundary (2026-10-13)

Acceptance remains unmet: the release gate has not been reproduced green on a
fresh stack. This branch is diagnosis only; PR #227 must reference `Refs #221`.
The harness manages the PR body and push; neither was changed here.

First-hand inspection at FlowLine HEAD `ceea86474177cc28d6522e60f3bd0b8e14dd82a4`:

- The saved stable log passes all five auth tests at lines 57–61, then runs
  `core-api` again at line 481 and reports the 200/403 mismatch at lines 489–490.
- The current hub `nql-agents/src/jobs/stable.ts:193–195` selects whole shard
  invocations for quota fallback and reuses the stack. Its confirmation caller
  at line 202 does not propagate the staged-suite environment.
- The hub test `ops/verify/e2e-army/tests-dev/FlowLine_Web/core-api.e2e.ts:11–19`
  uses a seeded account and expects an unverified sign-in to return 403.
  FlowLine already configures `requireEmailVerification: true` in
  `src/lib/auth.ts:45`. No product guard or test assertion was weakened.

**Required dispatch:** assign a focused task in `AbdelrhmanAh7/nql-agents` to
isolate repeat-run data, select only quota-affected tests, and propagate the
suite stage through `confirmFailures` and all its callers. Add hub regression
tests proving these contracts before changing its implementation. Then run the
auth feature on a fresh stack and record the tested product and hub SHAs.

This workspace cannot implement that fix: the hub is outside its writable roots.
The reproduction script also invokes a production build through
`ops/verify/FlowLine_Web.sh` and reads Keychain credentials; this task forbids
local FlowLine builds and touching secrets. No fresh-stack result is claimed.
`git fetch -q` also failed because the shared Git metadata is outside the sandbox
writable roots. Do not close #221 on the strength of the historical first pass.

Question for the dispatcher: can the hub task be assigned with authorization for
its isolated-stack verification? The prior CTO answer requested the fix but did
not provide a writable hub checkout in this implementation lane.
