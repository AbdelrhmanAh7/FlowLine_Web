# Repository security and review settings

Issue [#24](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/24). The repository is public, so secret scanning, push protection, Dependabot alerts and CodeQL default setup cost nothing. These are GitHub settings, not files in the repo; only the owner (repository admin) changes them.

## Current state

Owner enabled the first four on 2026-10-03 16:20 UTC ([issue comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/24)). Re-checked 2026-10-07 with read-only `gh api` queries (commands below); unchanged since 2026-10-03.

| Setting | State | Where |
| --- | --- | --- |
| Secret scanning | **enabled** (0 open alerts at enable time; history scan runs in the background) | Settings → Code security |
| Push protection | **enabled** | Settings → Code security |
| Secret scanning non-provider patterns, validity checks | disabled | Settings → Code security |
| Dependabot alerts | **enabled** | Settings → Code security |
| Dependabot security-update PRs | **off on purpose**: each PR would get an automatic CodeRabbit review and use the shared review budget ([GITHUB_WORKFLOW.md](../GITHUB_WORKFLOW.md), rule 3). Turn on later if wanted | Settings → Code security |
| Dependabot version updates | off (no `.github/dependabot.yml`), same reason | repo file |
| CodeQL code scanning | **default setup, configured** (languages as the API lists them: `actions`, `javascript`, `javascript-typescript`, `python`, `typescript`; query suite `default`; first run 37136327901). No CodeQL workflow file in `.github/workflows/`, and none should be added while default setup is on | Settings → Code security |
| Copilot automatic code review | **not enabled** (owner-only, pending per the issue; #24 stays open for it). The `main protection` ruleset has no Copilot review rule (its rules on 2026-10-07: `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`); the owner's account-level setting cannot be read from the repo API and has not been reported as on | Settings → Rules → Rulesets (rule), or Copilot settings → Code review (account) |

## Pending owner action: Copilot code review

Copilot Pro adds automatic Copilot code review as a second reviewer next to CodeRabbit (GitHub offers it on Copilot Pro, Pro+ and Max, or with a Business or Enterprise licence). GitHub provides two independent sources; the owner picks one and records which, because the verification differs. Copilot Pro premium requests are limited, so the ruleset scoped to main is the cheaper choice:

1. **Repository ruleset**: Settings → Rules → Rulesets → **main protection** (targets the default branch) → Branch rules → **Automatically request Copilot code review**. Leave *Review new pushes* off (each push would use another premium request) and *Review draft pull requests* off (implementer PRs start as drafts; Copilot then reviews when the PR is marked ready).
2. **Account setting**: profile picture → Copilot settings → Code review → **Automatic Copilot code review** (same optional *Review new pushes* and *Review draft pull requests*). This covers every PR the owner's account creates in any repository, so it uses more premium requests.

### Verifying it, by source

- Ruleset: `gh api repos/AbdelrhmanAh7/FlowLine_Web/rulesets/24420405 --jq '.rules[].type'` lists `copilot_code_review` (rule parameters: `review_on_push`, `review_draft_pull_requests`).
- Account setting: no repository API exposes a personal Copilot setting, and the ruleset command above stays unchanged. The record is the owner's statement of the toggle state on the settings page (text is enough; no screenshot of account details).
- Either source: the next PR into main gets a review from the Copilot reviewer. `gh api repos/AbdelrhmanAh7/FlowLine_Web/pulls/<N>/reviews --jq '.[].user.login'` includes `copilot-pull-request-reviewer[bot]` (shown as Copilot in the PR UI).

After it is on, record the date and the source in the table above and in [OWNER_ACTIONS.md](../implementation/OWNER_ACTIONS.md), then close issue #24, which stays open until then (PR #59 references it without closing it).

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
gh api repos/AbdelrhmanAh7/FlowLine_Web/rulesets/24420405 --jq '.rules[].type'   # copilot_code_review appears only for the ruleset source
gh api repos/AbdelrhmanAh7/FlowLine_Web/pulls/<N>/reviews --jq '.[].user.login'   # copilot-pull-request-reviewer[bot] once Copilot reviewed PR N (either source)
```
