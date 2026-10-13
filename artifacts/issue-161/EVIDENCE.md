# Evidence — issue #161 (docs for security posture)

Verified by reading the diff against main at head 3d940e6 (the PR head is authoritative; later commits only touch this note). Docs-only; no e2e-army test.

| AC | Verification |
|----|--------------|
| AGENTS.md security posture rule | `grep -n "Security posture" AGENTS.md` |
| Shell placeholder fixed | `docs/implementation/OWNER_ACTIONS.md` uses `"$OWNER_EMAIL"` in the bootstrap command; the path `docs/security/REPO_SECURITY_SETTINGS.md` does not exist, the #160 security settings doc is `OWNER_ACTIONS.md` |
| PR template section | `.github/pull_request_template.md` has `## Security posture` |
| Docs reflect the security settings state | `docs/implementation/OWNER_ACTIONS.md` rows AC1-AC3 (lines 12-16) state each #160 setting as `unverified` until the owner records evidence; AGENTS.md line 32 states the same rule. This PR adds no new claim beyond that: none of the settings is enabled by this PR. |
| Dependabot bump (brief item 5) | Not done here: engineers may not inspect alerts; the open Dependabot alert is tracked in #62. |

Issue linkage: this PR uses `Refs #161` and `Refs #24`, not a closing keyword, because item 5 is open.
