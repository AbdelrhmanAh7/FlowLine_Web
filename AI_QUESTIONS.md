# AI_QUESTIONS.md

## Issue #110: Pilot plan → 2026-10-16 (no implementation possible in one PR)

Checked on 2026-10-12 on branch `ai/110` at `b1023c9` (same as `origin/main`, so the branch had no earlier commits). No code was changed and no e2e-army test was added.

### Why this issue cannot be done as an implementation PR

#110 is the hub's generated pilot-plan tracker (`<!-- nql-pilot-plan -->`). Its body says it is "refreshed daily; the checklist ticks itself when the step's evidence exists". Each unchecked item belongs to someone else, or is already tracked by its own issue:

| Checklist item | Owner named in the plan | Why it does not belong in this PR |
|---|---|---|
| 2026-10-12: #60 #62 #63 closed, main CI green | dispatch + engineers + automerge | #62 (Dependabot high alert) is still open as its own issue. Fixing it here would bundle a second issue, which the one-task-per-PR rule forbids. |
| 2026-10-14: first `stable-YYYY-MM-DD` tag, 25/25 pilot features green | hub job `stable` (20:00 Riyadh) | Tagging, fast-forwarding `stable` and deploying staging are hub and owner actions. Agents do not push, tag or deploy. |
| 2026-10-15: #103 #68 closed, 25/25 pilot features covered by e2e | dispatch + e2eregress | #103 (CSV column order) and #68 (restore/rollback runbook) are separate issues. Covering 25 features with e2e is far larger than one ~300-line PR. Coverage tests live in the hub suite (`ops/verify/e2e-army/tests/FlowLine_Web/`) in `nql-agents`, not in this repo. |
| 2026-11-06: 5 pilot users invited, 3 signed in | owner (`scripts/beta/create-code.mts`) | Real invitations are owner-only (AGENTS.md constitution, article 7). |
| 2026-11-06: story video (EN+AR) on the landing page | Claude (tools/story-video), #137 | Tracked by #137. |
| 2026-11-13: week-1 review with measured numbers | owner + hub CEO brief | Needs real pilot usage data. |

### Questions for the owner / dispatcher

1. Should #110 be removed from the engineer dispatch queue (for example with a `tracking` or `owner-only` label)? It is a status issue that the hub closes itself.
2. If you want e2e coverage of the 25 pilot features from this repo, which features should be split into separate issues? Ideally one issue per feature (or small group), each with its own acceptance criterion, so each can be one ~100–300-line PR with an `e2e-army/<issue>-<flow>.e2e.ts` test tagged `feat:<id>`.
3. No test was added because the issue has no user-facing acceptance criterion of its own. A PR for this branch would contain only this note. Its description should state `E2E: not needed — tracking issue, no product change`.
4. PR #209 said `Closes #110`, which would have closed the hub's pilot-plan tracker on merge before its checklist was done. Fixed on 2026-10-12 (fix-review round 1): the first line of the PR body now says `Refs #110`, and `gh pr view 209 --json closingIssuesReferences` returns `[]`. The branch's commit messages only use `Refs #110`, so a squash merge does not close it either. The harness wrote `Closes #N` itself; if it regenerates the body, it must keep `Refs #110` for this tracker (see `docs/GITHUB_WORKFLOW.md`). Should the harness use `Refs #N` for every hub tracker issue (`<!-- nql-pilot-plan -->`)?
