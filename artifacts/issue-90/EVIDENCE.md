# Evidence for #90

Not user-facing (test-only helper), so no e2e-army test.

| Acceptance criterion | Verified by |
|---|---|
| Helper exported + header usage example | `tests/helpers/concurrentTx.ts` header comment |
| Opposite-order pair detected as deadlock | `tests/integration/concurrent-tx.test.ts` |
| Same-order pair passes | `tests/integration/concurrent-tx.test.ts` |
| Deterministic, <10 s | CI `checks` run on the pushed commit |
| No `.github/` changes | `git diff main --stat` |

Fix this round: add `'error'` listeners on pg clients so backends terminated on timeout do not raise an unhandled error.
Not run locally: this worktree has no node_modules and no test database, so verification is on CI (the 20-run loop is not done here).
