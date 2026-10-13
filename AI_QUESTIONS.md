# Open questions for the CTO — issue #204 (PR #207)

## Follow-up: strict insertion order in history

History now sorts by `created_at`, since `version` can be NULL. `created_at` defaults to `now()`, which is the
transaction start, so two snapshots written by overlapping transactions can show in the wrong order (Codex thread on
PR #207). An earlier commit fixed this with a `flow_version.seq` bigserial column; QA asked for it to move to a separate
follow-up to keep this PR to the product fix, unit test and e2e spec. Proposed follow-up issue: "flow history: order
snapshots by insertion (`seq` column or `clock_timestamp()` default)", with the regression test from commit `ea60845`.
