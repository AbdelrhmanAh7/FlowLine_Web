## What and why

<!-- One short paragraph: the change and the reason. -->

## Docs updated (mandatory — AGENTS.md "Docs (mandatory)")

<!-- List every .md you changed and what you changed in it. To waive a docs update, add the docs-not-needed label AND an unindented plain-text line using exactly this prefix: `Docs not needed because: <reason>`. Replace <reason> with a real explanation on that same line. A label alone, a whitespace-only reason, the unfilled `<reason>` placeholder (or the bare word reason), or another format does not waive the check. -->

- [ ] Area doc for the code touched (`docs/<area>/…`, `README.md`, `docs/DEVELOPER_GUIDE.md` for commands/setup)
- [ ] Progress / status ledger for the active phase (`docs/implementation/…`)
- [ ] `NEXT_ACTION.md` if work stops mid-task or the next step changed
- [ ] `SCOPE_MATRIX.md` / `AGENTS.md` if scope or a rule changed
- [ ] No doc still describes the old behaviour

## Checks

<!-- Focused checks run locally (commands + results). CI: fast tier by default; run the full tier once, just before merging, via Actions → Gate → Run workflow (tier=full). Labels do not start Gate. -->

- [ ] Security posture (`docs/security/REPO_SECURITY_SETTINGS.md`): no push-protection bypass for a real credential; any secret-scanning, Dependabot, CodeQL or Copilot review item raised on this PR is handled as that doc says
