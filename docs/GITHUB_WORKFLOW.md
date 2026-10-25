# GitHub workflow

Every piece of work is tracked on GitHub so its state is visible without reading agent logs. Rules apply to the owner and to every agent.

## Board, milestones, issues

- **Board:** [FlowLine — Delivery](https://github.com/users/AbdelrhmanAh7/projects/21) (Projects v2, linked to the repo). Fields: **Status** (Todo, In progress, In review, Blocked, Done), **Priority** (P0–P3), **Area**.
- **Milestones** group work by delivery goal: *Paid pilot: security hardening*, *CI & repo workflow*, *Paid pilot: owner readiness*, *Field validation v2*. Add a milestone before starting a new goal.
- **Every task starts as an issue** (or an existing one) with a milestone, a `type:` label, a `priority:` label and area. Work found during a task that is out of scope becomes a new issue, never a silent TODO.
- **Every PR** links its issue (`Closes #N` in the body; for an owner-tracking issue labelled `owner-only` or `needs-owner`, such as #162, use the non-closing `Refs #N` so merging leaves the issue open for the owner to close), carries the same milestone and labels, and is on the board. Status moves: Todo → In progress (branch exists) → In review (PR open) → Done (merged); Blocked when waiting on something external.

## Labels

| Group | Labels | Use |
| --- | --- | --- |
| Type | `type: bug`, `feature`, `security`, `docs`, `ci`, `chore`, `test` | exactly one main type |
| Area | `area: auth`, `billing`, `ai-hub`, `knowledge`, `engine`, `ui`, `i18n`, `infra`, `company-builder` | code areas touched |
| Priority | `priority: P0`–`P3` | P0 blocks release or is security-critical; P1 needed for the current milestone |
| Status | `status: blocked`, `needs-owner`, `needs-coderabbit`, `ready-to-merge` | why an item is not moving |
| Workflow | `docs-not-needed`, `stacked` (`full-gate`: obsolete) | `docs-not-needed` waives the docs check and needs an unindented `Docs not needed because: <reason>` PR body line with a real reason; `stacked` marks a PR whose base is another PR. `full-gate` does nothing since PR #20 (Gate has no `labeled` trigger; the full tier runs only from a manual dispatch, see Merging into main): delete the label, or repurpose it as a plain "full tier run recorded" marker, so nobody expects it to start CI |

## Merging into main

The **main protection** ruleset enforces: a PR, the `gate` and `docs` checks passing, every conversation resolved, no force-push or deletion. On top of that (team rule):

1. Every CodeRabbit thread gets a reply; fixes are answered with `Fixed in <sha>: …` and a `@coderabbitai` verification request (one PR-level comment listing the threads saves chat budget).
2. A thread is resolved only after CodeRabbit confirms the fix; if it disagrees, fix again.
3. CodeRabbit budget for Flowline: at most 3 reviews per rolling hour (2 are reserved for another project); automatic re-review is off, so request `@coderabbitai review` after each fix push.
4. Run the full CI tier once on the final candidate, just before merging: Actions → Gate → Run workflow, choose the branch and set `tier` to `full` (or `gh workflow run gate.yml --ref <branch> -f tier=full`). Labels never start CI. The owner verifies that run passed; merge when it and the required `gate` and `docs` checks are green, then move the item to Done and close the issue.
5. Stacked PRs merge top-down after their base.
6. Draft PRs are never merged, folded into another PR or carried by fast-forwarding their base branch (that makes GitHub mark the draft "merged" without its own review; this happened once with #34, see its exception record). Mark the draft ready so CodeRabbit reviews it, then merge it explicitly, or close it with a recorded reason.

### Verifying the `gate` check

Before merging any PR, verify the `gate` check is green with one of these commands:

1. **Quick status** (shows all required checks including `gate` and `docs`):
   ```bash
   gh pr checks <PR_NUMBER> --required
   ```
   Exit code 0 with `gate` showing `✓` (or `PASS` in the summary) means the check passed.

2. **Detailed rollup** (programmatic, includes conclusion and started/finished timestamps):
   ```bash
   gh pr view <PR_NUMBER> --json statusCheckRollup --jq '.statusCheckRollup[] | select(.name=="gate") | {name, conclusion, startedAt, completedAt}'
   ```
   Expect `"conclusion": "SUCCESS"`. Do not treat empty output as success; missing, queued, pending, skipped or unsuccessful checks are not verified.

3. **Find the matching Actions run** (useful when the check name is ambiguous or you need the run URL):
   ```bash
   gh run list --workflow gate.yml --branch <BRANCH_NAME> --limit 5 --json databaseId,conclusion,headBranch,createdAt,url
   ```
   Pick the run for your branch/HEAD; `conclusion` must be `success`.

4. **Full-tier verification** (only after a manual `workflow_dispatch` with `tier=full`):
   ```bash
   gh run list --workflow gate.yml --branch <BRANCH_NAME> --event workflow_dispatch --limit 20 --json databaseId,conclusion,headBranch,headSha,createdAt,url
   gh pr view <PR_NUMBER> --json headRefOid
   gh run view <RUN_ID> --json headSha,event,conclusion,url,jobs
   ```
   Select a run ID whose `headSha` equals the current PR `headRefOid`; paginate with `gh api` or use the dispatch run URL if it is outside the list. Require `event=workflow_dispatch`, `conclusion=success`, and completed successful `firefox` and `webkit` jobs. In `.github/workflows/gate.yml`, both browser jobs run only when `inputs.tier == 'full'`; a fast run skips them. A successful run with skipped browser jobs is not full-tier evidence. Record the run URL and SHA, and recheck the PR head before merging.

If any `gate` check is red, do **not** merge. Read the job summary (click the `gate` check → the combiner step) to see which leg failed (`changes`, `checks`, `chromium`, `firefox`, `webkit`). Fix the underlying failure, push, wait for the new run, and re-verify.

## Exception records

The constitution in `AGENTS.md` allows an exception only with a written reason recorded before or at the moment of the action, in the commit message **and** on the PR or issue. Use this shape:

```text
Exception: <which rule is not followed>
Reason: <why it is necessary now>
Risk: <what could go wrong>
Verification: <how the result was checked: run ids, SHAs, reviewer confirmation>
Approved by: <owner; delegated reviewer only where the affected rule permits delegation>
```

A missed record is added retroactively on the PR as soon as it is found, labelled as retroactive.

## AI implementers (Mac mini hub)

The AI implementers no longer run from GitHub Actions: `.github/workflows/ai-implementers.yml` (self-hosted `[self-hosted, macmini]` runner) was removed in #157 (`592a07a`), and the hub's launchd jobs on the Mac mini schedule them (see `docs/slimdown-plan.md`). Engine order and scheduling live in the hub (`AbdelrhmanAh7/nql-agents`), not in this repository.

- **Issue #60 (CI red at `f655e51`, PR #54):** the `start` job failed with `git config` exit 5 ("cannot overwrite multiple values with a single value") because the persistent self-hosted runner reused its checkout, so `credential.helper` held several values in `.git/config`. The cleanup is in the hub: `git_as_owner` in `bin/common.sh` runs `git config --local --unset-all` before re-adding the keys (hub commit [`41c658f`](https://github.com/AbdelrhmanAh7/nql-agents/commit/41c658f0720effff140287e4101f6cbd2e951627), 2026-10-06T02:45:20Z). Evidence: `artifacts/phase-4/issue-60/EVIDENCE.md`.
- **Guard in this repo:** `tests/unit/ci-workflows.test.ts` ("workflow files") requires every `runs-on` to be `ubuntu-24.04` (a fresh workspace per job), forbids `ai-implementers.yml`, and checks that no workflow mentions `self-hosted`, so a persistent runner cannot come back unnoticed.
