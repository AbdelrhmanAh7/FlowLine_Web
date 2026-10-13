# Evidence — issue #161 (docs for security posture)

Tested at base SHA 0b847de (changes uncommitted at writing; see the PR head for the final SHA). Docs-only; no e2e-army test.

| AC | Verification |
|----|--------------|
| AGENTS.md security posture rule | `grep -n "Security posture" AGENTS.md` |
| Shell placeholder fixed | `docs/implementation/OWNER_ACTIONS.md` uses `"$OWNER_EMAIL"` in the bootstrap command; the path `docs/security/REPO_SECURITY_SETTINGS.md` does not exist, the #160 security settings doc is `OWNER_ACTIONS.md` |
| PR template section | `.github/pull_request_template.md` has `## Security posture` |
| Docs reflect features | Unchanged claim: all #160 rows stay `unverified` until the owner records evidence |
