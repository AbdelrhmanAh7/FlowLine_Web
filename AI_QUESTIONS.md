# Open questions for the CTO — issue #204 (PR #207)

## 1. Should Ctrl/⌘+S saves keep a version number?

The decision says publishedVersion "must increment only on publish, never on runs or revisions". This PR makes run
snapshots unnumbered. Draft revisions (autosave, which bumps `flow.revision`) never wrote a snapshot, and
`tests/integration/runs.test.ts` ("draft revisions … and runs leave the first publication at v1") proves they still don't
move the number.

An explicit Ctrl/⌘+S save (`saveFlow` with `createVersion: true`) still writes a `save` snapshot that takes the next
number of the same per-flow sequence as publications, so publishing after one explicit save gives v2. That is how it
worked before #204, and the hub fixture for `feat:fl-flows-list` does not save, so it isn't part of the gate failure.
Numbering publications separately would reach further than this minimal fix: subflow steps pin a published `version`
number (`src/server/publish.ts` `serverIssues`, `src/components/builder/node-config.tsx`), the history panel shows "Version N"
for saves, and `flow_version_unique` covers `(flow_id, version)`.

Options:
- **A (current):** saves stay numbered; publication numbers can skip the numbers saves took.
- **B:** saves become unnumbered like runs (small: one more reason in `insertVersion` plus a backfill line), so
  publications are always 1, 2, 3, … Saves would then show "Saved snapshot" in history instead of "Version N".

Needs a decision before anything changes; A is kept for now.

## 2. Follow-up: strict insertion order in history

History now sorts by `created_at`, since `version` can be NULL. `created_at` defaults to `now()`, which is the
transaction start, so two snapshots written by overlapping transactions can show in the wrong order (Codex thread on
PR #207). An earlier commit fixed this with a `flow_version.seq` bigserial column; QA asked for it to move to a separate
follow-up to keep this PR to the product fix, unit test and e2e spec. Proposed follow-up issue: "flow history: order
snapshots by insertion (`seq` column or `clock_timestamp()` default)", with the regression test from commit `ea60845`.
