# GitHub workflow

Every piece of work is tracked on GitHub so its state is visible without reading agent logs. Rules apply to the owner and to every agent.

## Board, milestones, issues

- **Board:** [FlowLine — Delivery](https://github.com/users/AbdelrhmanAh7/projects/21) (Projects v2, linked to the repo). Fields: **Status** (Todo, In progress, In review, Blocked, Done), **Priority** (P0–P3), **Area**.
- **Milestones** group work by delivery goal: *Paid pilot: security hardening*, *CI & repo workflow*, *Paid pilot: owner readiness*, *Field validation v2*. Add a milestone before starting a new goal.
- **Every task starts as an issue** (or an existing one) with a milestone, a `type:` label, a `priority:` label and area. Work found during a task that is out of scope becomes a new issue, never a silent TODO.
- **Every PR** links its issue (`Closes #N` in the body), carries the same milestone and labels, and is on the board. Status moves: Todo → In progress (branch exists) → In review (PR open) → Done (merged); Blocked when waiting on something external.

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

## AI implementers (Mac mini hub)

The repo runs autonomous AI implementers on the owner's self-hosted runner (`[self-hosted, macmini]`):

- **Workflow:** `.github/workflows/ai-implementers.yml`.
- **Schedule:** 24/7 runs every 2 hours (`cron: "0 */2 * * *"`) picking the oldest `ai-ready` issue; a rescue job runs every 3 hours (`30 */3 * * *`), and an automerge job runs hourly (`15 * * * *`).
- **Engines:** Free engines first (Gemini via agy, OpenRouter free via Command Code, local models) before falling back to Claude and Codex.
- **Persistent runner git hygiene:** self-hosted runners reuse checkout workspaces, so a key such as `credential.helper` can accumulate several values in `.git/config` and a later single-value `git config` fails with exit code 5 ("cannot overwrite multiple values with a single value"; issue #60). The hub scripts own this cleanup (`git_as_owner` in the hub's `bin/common.sh` runs `git config --local --unset-all` for `credential.helper` and `http.https://github.com/.extraheader` before re-adding them); the workflow file is owner-only and is not changed for it.
