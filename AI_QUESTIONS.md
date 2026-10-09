# Open questions (PR #92, chore/prune-tests)

## Who triages a red nightly (`sec-*` suites included)?

CodeRabbit asks `docs/implementation/SMALL_GATES.md` ("Nightly tier") to name an accountable owner and a notification route for
`nightly.yml` failures, because the nightly is not a required check and now carries `sec-upgrade`, `sec-cxh06-rotation` and
`sec-cxh01-backfill`. Naming a person or a channel is an owner decision, so it is not guessed here.

Please decide:
1. Owner for nightly triage (a GitHub user or team), and
2. Notification route (GitHub Actions failure email to that user, a tracking issue opened by the workflow, or another channel).

Once decided, add both to the "Nightly tier" section of `docs/implementation/SMALL_GATES.md`. Opening an issue from the workflow
would also need a `nightly.yml` change (`issues: write`), which is why it is not done in this PR.
