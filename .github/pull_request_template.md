## What and why

<!-- One short paragraph: the change and the reason. Link the issue with `Closes #N`; for an owner-tracking issue (label `owner-only` or `needs-owner`) write `Refs #N` instead, so merging does not close it. If acceptance criteria are deferred to another issue, also use `Refs #N` and link the follow-up. Verify the live body before merge with `gh pr view YOUR_PR_NUMBER --json body,closingIssuesReferences`; local notes do not change GitHub linkage. -->

## Docs updated (mandatory — AGENTS.md "Docs (mandatory)")

<!-- List every .md you changed and what you changed in it. To waive a docs update, add the docs-not-needed label AND an unindented plain-text line using exactly this prefix: `Docs not needed because: <reason>`. Replace <reason> with a real explanation on that same line. A label alone, a whitespace-only reason, the unfilled `<reason>` placeholder (or the bare word reason), or another format does not waive the check. -->

- [ ] Area doc for the code touched (`docs/<area>/…`, `README.md`, `docs/DEVELOPER_GUIDE.md` for commands/setup)
- [ ] Progress / status ledger for the active phase (`docs/implementation/…`)
- [ ] `NEXT_ACTION.md` if work stops mid-task or the next step changed
- [ ] `SCOPE_MATRIX.md` / `AGENTS.md` if scope or a rule changed
- [ ] No doc still describes the old behaviour

## Security posture (AGENTS.md "Security posture")

<!-- Settings and states only. Never paste secret values or what an alert contains. -->

- [ ] Dependencies: none added or upgraded, or listed above with the reason
- [ ] Secrets: none added or read, or the new variable names are listed (no values)
- [ ] Permissions / workflow tokens: unchanged, or the change is explained above
- [ ] No claim that an owner-only GitHub security setting is enabled without the owner's recorded evidence

## Checks

<!-- Focused checks run locally (commands + results). CI: fast tier by default; run the full tier once, just before merging, via Actions → Gate → Run workflow (tier=full). Labels do not start Gate. -->
