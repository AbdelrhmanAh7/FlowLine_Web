# Issue #192: what this branch closes, and the follow-ups

Issue #192 lists several independent audit items. Under the one-task-per-PR and ~300-line rules, this branch covers the
code findings in the test helpers and the password-reset flow, each with a test. The rest are listed below as follow-ups.

## Done on this branch (tests added; the code was already fixed on `main`)

- **#125 (`tests/helpers/concurrentPgTx.ts`).** All three Major findings are already handled in `main`'s code:
  `open()` ends the client when `pg_backend_pid()` fails, `timeoutMs` bounds opening the connections, and a `40P01`
  rejects at once through the core. What was missing was a test that runs without PostgreSQL.
  `tests/unit/concurrentPgTx.test.ts` mocks `pg` and pins all three. Each test fails when its fix is removed
  (checked locally by mutation).
- **#127 (`tests/helpers/concurrentTx.ts`).** Already fixed on `main`: both callbacks start through
  `Promise.resolve().then(...)`, and `tests/unit/concurrentTx.test.ts` has the "txA throws synchronously" case. The Minor
  thread is also addressed: the fake error now reads "transaction conflict" and the test checks for
  `deadlock detected (40P01)`. The PR reply that said "Not applied" is out of date and should be corrected on PR #127.
- **#65 (`src/server/email/flows.ts`).** The second commit of PR #65 moved the scrypt hash under the user and token locks,
  so a burst of resets with one valid link hashes once. Our "does not address the issue" reply was written before that
  commit. `tests/unit/email-token-lock-order.test.ts` now runs two resets with the same link at once: one hash, results
  `["done", "used"]`. The test fails when the hash is moved back before the transaction.

Not user-facing: only tests and docs change, with no route, UI or API behaviour, so no e2e-army test is added.

## Follow-ups (not in this PR)

1. **#128 lock-order violations:** already split off as #241 (open). That issue owns the "Known violations" section of
   `docs/engineering/lock-order.md`.
2. **#102 `.coderabbit.yaml`: nothing left to apply, needs only a recorded closure on the PR.** `auto_incremental_review`
   is `false` with a comment that matches `docs/GITHUB_WORKFLOW.md` (line 12), and the "e2e test for UI flows" check
   points at `e2e/` (line 74). The third finding (anchor `!public/media/**` as `!**/public/media/**`) does not apply: this
   is a single-package repo with no nested `public/` (there is no `media` directory at all). The owner notes keep CI and
   review config owner-only, so this branch does not touch the file.
3. **#81, #83, #87 (gate and Claude Action workflows):** the one-time review against the QA checklist is still to do. Any
   fix is a `.github/workflows` change, so per the owner notes it stops at the owner. Proposed: a separate issue that
   records the checklist result per PR and lists any fix as a suggestion.
4. **#40, #82, #134, #159:** still to confirm that every CodeRabbit thread is resolved with CodeRabbit's own
   confirmation. This needs GitHub API reads, which were rate-limited by the hub's gh budget guard during this run.
   Proposed: a separate docs-only check issue.
