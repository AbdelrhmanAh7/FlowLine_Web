# #239 blocked: Mizano create-action tests depend on unmerged #147

Refs #239, part of #147.

- On `main` (9c754b2), `mizano.create_customer` and `mizano.create_draft_quote` are not registered. `git grep` finds no reference to either name in `src/` or `tests/`, and `src/integrations/providers/mizano.ts` on main registers only `mizano.list_overdue_invoices` plus verify.
- The describe blocks and the loose `toHaveProperty("Idempotency-Key")` assertions named in the brief exist only on `ai/147` (b32a51b, 779c3b1). `tests/contract/mizano.test.ts` on this branch has no changes against main.
- Commit ac4ecf1 on this branch already removed the duplicate suites that earlier attempts added (commit 9166798).

Question: should #239 wait for #147 to merge, then rebase `ai/239` onto main and apply the two assertion replacements and the double-call tests? Until then, this branch contains no test change for #239.

Not user-facing (tests only): no e2e-army test is added.
