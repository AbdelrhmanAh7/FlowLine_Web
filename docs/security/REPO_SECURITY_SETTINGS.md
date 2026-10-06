# Repository security and review settings

Issue [#24](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/24). The repository is public, so secret scanning, push protection, Dependabot alerts and CodeQL default setup cost nothing. These are GitHub settings, not files in the repo; only the owner (repository admin) changes them.

## Current state

Owner enabled the first four on 2026-10-03 16:20 UTC ([issue comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/24)). Re-checked 2026-10-06 with read-only `gh api` queries (commands below).

| Setting | State | Where |
| --- | --- | --- |
| Secret scanning | **enabled** (0 open alerts at enable time; history scan runs in the background) | Settings → Code security |
| Push protection | **enabled** | Settings → Code security |
| Secret scanning non-provider patterns, validity checks | disabled | Settings → Code security |
| Dependabot alerts | **enabled** | Settings → Code security |
| Dependabot security-update PRs | **off on purpose**: each PR would get an automatic CodeRabbit review and use the shared review budget ([GITHUB_WORKFLOW.md](../GITHUB_WORKFLOW.md), rule 3). Turn on later if wanted | Settings → Code security |
| Dependabot version updates | off (no `.github/dependabot.yml`), same reason | repo file |
| CodeQL code scanning | **default setup, configured** (languages: actions, javascript-typescript, python; query suite `default`; first run 37136327901). No CodeQL workflow file in `.github/workflows/`, and none should be added while default setup is on | Settings → Code security |
| Copilot automatic code review | **not enabled** (owner-only, pending per the issue). The `main protection` ruleset has no Copilot review rule; the owner's personal Copilot setting cannot be read from the repo API | Settings → Copilot → Code review, or a ruleset rule |

## Pending owner action: Copilot code review

Copilot Pro adds automatic Copilot code review as a second reviewer next to CodeRabbit. Copilot Pro premium requests are limited, so enable it only for PRs into main:

1. Settings → Rules → Rulesets → **main protection** (targets the default branch) → add the rule **Automatically request Copilot code review**. Optionally tick *Review new pushes* (each push then uses another premium request; leave it off to save budget).
2. Or, per account: Settings → Copilot → Code review → automatic review for your own PRs (applies to every branch, so it uses more requests).

After it is on, record the date here and in [OWNER_ACTIONS.md](../implementation/OWNER_ACTIONS.md).

## Rules for contributors and agents

- **Push protection block:** if a push is rejected for a detected secret, do not use the bypass for a real credential. Remove it from the commits (rewrite the unpushed branch), rotate the credential if it was ever pushed anywhere, and push again. Bypass only for a confirmed false positive or test fixture, and say so in the PR. Push protection does not replace the evidence-secrets check (`pnpm check:evidence`, run by the Gate `checks` job): it matches known token formats, while that check compares against the real local env values.
- **Secret scanning alert:** treat it as an incident: rotate the credential at the provider first, then close the alert as *revoked*. Never paste the secret into an issue, PR or evidence.
- **Dependabot alert:** fix it in a normal tracked PR (issue, milestone, labels; [GITHUB_WORKFLOW.md](../GITHUB_WORKFLOW.md)) that updates the dependency and `pnpm-lock.yaml`, with docs as usual.
- **CodeQL alert:** fix it, or dismiss it as a false positive with the reason written down next to the code's docs (example: alert #11 in [FEDERATED_MFA.md](FEDERATED_MFA.md)).
- **Copilot review comments** (once enabled) are advisory, like any reviewer's: reply to each thread. The `main protection` ruleset requires every conversation resolved, so Copilot threads must be resolved before merge too. CodeRabbit's confirm-before-resolve rule still applies to CodeRabbit threads.

## Re-checking the state

Read-only; needs `gh` signed in with repo access:

```sh
gh api repos/AbdelrhmanAh7/FlowLine_Web --jq '{visibility, security_and_analysis}'
gh api repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/default-setup --jq '{state, languages, query_suite}'
gh api -i repos/AbdelrhmanAh7/FlowLine_Web/vulnerability-alerts | head -1   # 204 = Dependabot alerts on
gh api repos/AbdelrhmanAh7/FlowLine_Web/rulesets/24420405 --jq '.rules[].type'   # copilot_code_review once enabled
```
