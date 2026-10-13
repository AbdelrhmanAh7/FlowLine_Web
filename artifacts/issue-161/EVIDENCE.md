# Evidence — issue #161 (docs for security posture)

Verified by reading the diff against main at head 3d940e6 (the PR head is authoritative; later commits only touch this note). Docs-only; no e2e-army test.

| AC | Verification |
|----|--------------|
| AGENTS.md security posture rule | `grep -n "Security posture" AGENTS.md` |
| Shell placeholder fixed | `docs/implementation/OWNER_ACTIONS.md` uses `"$OWNER_EMAIL"` in the bootstrap command; the path `docs/security/REPO_SECURITY_SETTINGS.md` does not exist, the #160 security settings doc is `OWNER_ACTIONS.md` |
| PR template section | `.github/pull_request_template.md` has `## Security posture` |
| Docs reflect the security settings state | `docs/implementation/OWNER_ACTIONS.md` rows AC1-AC3 (lines 12-16) state each #160 setting as `unverified` until the owner records evidence; AGENTS.md line 32 states the same rule. This PR adds no new claim beyond that: none of the settings is enabled by this PR. |
| Dependabot bump (brief item 5) | Not done here: engineers may not inspect alerts; the open Dependabot alert is tracked in #62. |

## Round 3: closing-link root cause

Baseline tested: `b1c86e7dcf40a810cf303eaf5cf6e4d279e15e9e` plus this working-tree patch. The earlier issue-link claim was incorrect: a fresh `gh pr view 245 --json body,closingIssuesReferences` on 2026-10-13 returned a closing keyword in the first body line and #161 in closing references. Changing local notes did not update the live PR body.

The template now requires non-closing references for deferred criteria and a live check using `YOUR_PR_NUMBER`. `tests/unit/owner-tracking-keyword.test.ts` reproduces the missing instruction: 29 passed, 1 failed before the template change. The existing Vitest runner is reused; no dependency is added. Item 5 remains in #62 per the CTO answer, so the harness must retain `Refs #161` and `Refs #24`.

Fresh verification on 2026-10-13: `gh pr view 245 --json body,closingIssuesReferences` returned first lines `Refs #161` / `Refs #24` and `closingIssuesReferences: []` after correcting the existing body. `nice -n 10 pnpm exec vitest run --project unit tests/unit/owner-tracking-keyword.test.ts --maxWorkers=2`: 30 passed, 0 failed. `pnpm lint`: exit 0. The sandbox refused the nice priority adjustment; the single focused run still completed with the worker cap. No full suite or build was run locally.

`pnpm typecheck`: exit 0 after allowing access to the shared compiler lock (the sandboxed attempts could not acquire it). Local Node is v26.10.0 rather than the declared 24.x; pnpm warned about that mismatch. CI on the final candidate remains unverified.
