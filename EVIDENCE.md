# Evidence: Issue #24 (secret scanning + push protection, Dependabot alerts, Copilot code review)

Checked against commit `4de1b68` on branch `ai/24` (PR #59) at 2026-10-07 14:56 UTC with read-only `gh api` calls run by the AI implementer (Claude Fable 5.1). Requirement ids come from the PRD draft in Notion (Approval = Draft). Only states and counts are recorded: no alert contents, secrets or account details. The settings live in GitHub, not in this repository, so no commit changes them; the SHA is the docs revision the checks were made against.

## REQ-FL-24-1 — secret scanning with push protection: MET

`gh api repos/AbdelrhmanAh7/FlowLine_Web --jq '{visibility, security_and_analysis}'`

```json
{"security_and_analysis":{"dependabot_security_updates":{"status":"disabled"},"secret_scanning":{"status":"enabled"},"secret_scanning_non_provider_patterns":{"status":"disabled"},"secret_scanning_push_protection":{"status":"enabled"},"secret_scanning_validity_checks":{"status":"disabled"}},"visibility":"public"}
```

Open secret-scanning alerts: 0 (`gh api 'repos/AbdelrhmanAh7/FlowLine_Web/secret-scanning/alerts?state=open' --jq length`).

## REQ-FL-24-2 — Dependabot alerts: MET

- `gh api -i repos/AbdelrhmanAh7/FlowLine_Web/vulnerability-alerts | head -1` → `HTTP/2.0 204 No Content` (alerts enabled).
- `gh api repos/AbdelrhmanAh7/FlowLine_Web/automated-security-fixes` → `{"enabled":false,"paused":false}` (security-update PRs are off on purpose; see `docs/security/REPO_SECURITY_SETTINGS.md`).
- Open Dependabot alerts: 1 (`source-map-js`, high) → tracked in #62.

## REQ-FL-24-3 — Copilot code review as a second reviewer: NOT MET (owner action pending)

- `gh api repos/AbdelrhmanAh7/FlowLine_Web/rulesets/24420405 --jq '{name, enforcement, rules: [.rules[].type]}'` → `{"enforcement":"active","name":"main protection","rules":["deletion","non_fast_forward","pull_request","required_status_checks"]}`: no `copilot_code_review` rule.
- Reviewers on the last PRs into main (#53, #54, #56) and on #59: `coderabbitai[bot]` only; no `copilot-pull-request-reviewer[bot]`.
- The account-level setting is not readable through the repository API, and the owner has not reported it on. Enabling it is an owner-only step (`docs/implementation/OWNER_ACTIONS.md` item 5); issue #24 stays open until a Copilot review appears.

## Also recorded (not a PRD requirement)

- CodeQL default setup: `gh api repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/default-setup --jq '{state, languages, query_suite, updated_at}'` → `{"languages":["actions","javascript","javascript-typescript","python","typescript"],"query_suite":"default","state":"configured","updated_at":"2026-10-03T16:20:47Z"}`.
- Open code-scanning alerts: 13 → triage tracked in #63.

## Local checks on this branch

- `checkDocs` from `scripts/ci/docs-check.mjs` on the branch's file list: passed (code files changed: 1, the PR template; docs changed: 7, this file included). `classifyScope` from `scripts/ci/changed-scope.mjs`: docs-only, so CI's `gate` reports "docs-only change: test jobs skipped by design".
- Relative links in the edited Markdown files: 0 broken.
- `vitest run --project unit tests/unit/docs-check-script.test.ts tests/unit/changed-scope.test.ts`: 2 files, 183 tests passed (the scripts behind the `docs` check and the gate's scope classification; no test reads the PR template).
