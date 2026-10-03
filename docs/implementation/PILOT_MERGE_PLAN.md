# Pilot merge plan (PRs #12-#21, #31 and drafts #7/#9/#10/#11)

Read-only audit, collected 2026-10-03 about 15:45 UTC on `origin/main` = `9641ad1e6`. Nothing was committed, pushed, posted, labelled or merged. Every fact below cites a source ID from "Sources"; facts that were inferred or not checked are in section 5.

## Rules planned against

- `main protection` ruleset: PR required, 0 approvals, `required_review_thread_resolution: true`, required checks `gate` and `docs`, `strict_required_status_checks_policy: false` (branch need not be up to date), no bypass actors (S9). Merge methods allowed: merge, squash, rebase; `delete_branch_on_merge: false`; history on main uses merge commits (S9, S13).
- Owner rule: a CodeRabbit (CR) thread is resolved only after CR itself says resolved/OK. Team rules are in `docs/GITHUB_WORKFLOW.md` on `origin/claude/docs-freshness` (S0).
- CR limit: the live notice says "all 2 included reviews ... allowance at 2 reviews per hour", next review "in 55 minutes" at 15:13:34Z (#20) and "in 49 minutes" at 15:19:53Z (#31), i.e. about 16:08Z (S4). The owner budget (3/hour) and `.coderabbit.yaml` (assumes 5/hour per developer, S11) are both higher than what CR reports, so this plan uses at most 2 full reviews per rolling hour.

## 1. Per-PR table

CI = `gh pr checks N` at the current head (S2). "CR reviewed" = commit range of the last CR review (S3, S4). Threads from GraphQL (S5).

| PR | Head | Base | CI at head (S2) | CR review state | Threads (S5) | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| #20 ci-trim | `7da12cd6c` | main | gate/checks/chromium/docs pass; firefox, webkit skipped by design (fast tier); `mergeStateStatus` CLEAN (S1, S12) | Never reviewed: "Review limit reached" 15:13:34Z (S4) | 0 | None technical. Known: `gate.yml` `paths-ignore` (see B2), fixed by #34. Needs a CR review first (owner rule). |
| #12 report | `a9276f663` | main | all 6 pass (old full-tier workflow) | Reviewed `bc46dc2`; head is a docs fix | 1: CR-confirmed (15:23:06Z "Confirmed resolved at current head") | No `docs` check yet (BLOCKED). Add/add conflict with #15/#17/#21 doc (S8). |
| #13 runtime | `56f96d9ee` | main | all 6 pass | Reviewed head | 1: CR-confirmed ("I withdraw this finding", 15:22:33Z) | No `docs` check yet. Conflicts only with #31 (README). |
| #14 deps | `ec672d75c` | main | all 6 pass | Reviewed `dd840db` ("No actionable comments"); `ec672d7` is docs-only, unreviewed | 0 | `status: blocked` label; earlier WebKit failure on this PR "kept OPEN" in `docs/implementation/WEBKIT_14_DIAGNOSIS.md` (S6). Body is stale. Conflicts with #16/#20/#21 in PHASE4_BETA_REPORT.md. |
| #15 redact | `037af94a6` | main | all 6 pass | Reviewed head ("No actionable comments") | 0 | No `docs` check yet. Conflicts with #12/#17/#21 (doc), #17/#21 (`p3-sso.test.ts`). |
| #16 resource | `b63ffed90` | main | all 6 pass | Reviewed original `a9f7597`; `b63ffed` (Caddy ingress deadline) unreviewed | 2 resolved by us, our reply last = UNCONFIRMED (T1 deferral, T2 "deliberate") | No `docs` check. CR confirmation missing. Conflicts with #20/#14/#21 (PHASE4_BETA_REPORT.md), #31 (DEVELOPER_GUIDE.md). Body stale. |
| #17 auth | `448c68b74` | main | all 6 pass | Reviewed head ("No actionable issue remains") | 5: all CR-confirmed 15:23Z at `448c68b` | No `docs` check. Conflicts with #15 (doc, `p3-sso.test.ts`) and #12, #21. |
| #18 upload | `a8d7e5374` | #16 branch | fast tier pass (firefox/webkit skipped, base not main) | Reviewed `360078e`; 3 newer commits (rebase onto `b63ffed`, atomic admission, counters) unreviewed | 2 resolved by us, our reply last = UNCONFIRMED (T1 `run-focused.mjs:19` not outdated; T2 outdated) | Needs #16 merged first. CR confirmation missing. Body still says BLOCKED. Only PR with a migration (`drizzle/0024_warm_loki.sql`, S7). |
| #19 deadline | `1c6dcefb2` | #16 branch | fast tier pass | Reviewed `9d7f0c4`; two newer commits unreviewed | 1 resolved by us, our reply last = UNCONFIRMED (outdated) | Needs #16 merged first. CR confirmation missing. Body still says "NOT GATED / NOT MERGEABLE". |
| #21 federated MFA | `f06acea9e` | main | **FAIL**: integration 575 pass/8 fail, chromium 142/2, firefox 77/1, webkit 77/1 (S14); static pass | Reviewed head 15:21:55Z, 7 findings | 7 UNRESOLVED, no reply from us | CI red, 7 open threads, 90 files. Contains old #17 commit `08355ae` but lacks `5863f6e`/`3743e34`/`448c68b` (S13), so it duplicates already-fixed code (T5, T7 are the same findings #17 already fixed). Conflicts with #12/#15/#17/#14/#16/#20. |
| #31 docs refresh | `b72aa6b16` | main | all 6 pass (old workflow) | Never reviewed: "Review limit reached" 15:19:53Z | 0 | No `docs` check. Docs-only (17 `.md` files), so after #20 its `gate` will not run on a new push (B2). Conflicts with #20 (AGENTS.md, NEXT_ACTION.md, DEVELOPER_GUIDE.md), #13 (README.md), #16/#18/#19 (DEVELOPER_GUIDE.md). |

Thread totals (S5): CR-confirmed 7 (#12 1, #13 1, #17 5); resolved by us, CR never confirmed 5 (#16 2, #18 2, #19 1); unresolved with no reply 7 (#21). CR disagrees: none found. #14, #15, #20, #31 have no threads.

`mergeStateStatus` today (S1): BLOCKED for #12-#17, #21, #31 (all lack the `docs` check; #21 also fails `gate`); CLEAN for #20 and for #18/#19 (their base is not main, so the ruleset does not apply to them yet).

Docs check (S7, logic from S10 `docs-check.mjs`): every PR passes it because each changes at least one `.md` outside `artifacts/` (#12 and #31 change no code).

Facts about the unconfirmed threads at the current heads (S5, direct file reads, not a CR verdict):
- #16 T1: `deploy/beta/Caddyfile` now sets `read_body 10s` (line 9 at `b63ffed`), so the deferral looks addressed. T2 (rate-first admission) was left unchanged, so CR may still disagree.
- #18 T2: `src/server/retained-files.ts` now locks counter rows instead of aggregating the table. T1: the script records `testedSha` and a diff digest, but the child environment still spreads `...process.env` (line 39), so CR may say the environment-allowlist part is still open.
- #19 T1: only the commit title ("preserve body timeout and size status codes in routes") was read, not the route code.

## 2. Conflict matrix (textual, `git merge-tree`, S8)

`.` = merges cleanly. Letters name the conflicting file. All PRs merge cleanly into current main.

Legend: R = `docs/implementation/PHASE4_BETA_REPORT.md`, S = `docs/security/SECURITY_REVIEW_20261003.md` (add/add), P = `tests/integration/p3-sso.test.ts`, C = `tests/integration/sec-sso-link-consent.test.ts`, D = `docs/DEVELOPER_GUIDE.md`, A = `AGENTS.md` + `NEXT_ACTION.md` (+ D for #20 x #31), M = `README.md`, B = `docs/implementation/PRIVATE_BETA_RUNBOOK.md`.

| | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 31 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **12** | . | . | S | . | S | . | . | . | S | . | . |
| **13** |  | . | . | . | . | . | . | . | . | M | . |
| **14** |  |  | . | R | . | R | R | R | R | . | . |
| **15** |  |  |  | . | S,P | . | . | . | S,P | . | . |
| **16** |  |  |  |  | . | stack | stack | R | R | D | B |
| **17** |  |  |  |  |  | . | . | . | C | . | . |
| **18** |  |  |  |  |  |  | . | R | R | D | B |
| **19** |  |  |  |  |  |  |  | R | R | D | B |
| **20** |  |  |  |  |  |  |  |  | R | A | . |
| **21** |  |  |  |  |  |  |  |  |  | . | B |

Column 9 is draft #9. Drafts #10 and #11 conflict with nothing (S8).

Stack structure (S13, S1):
- #18 and #19 each contain #16's head `b63ffed90` as an ancestor, base = #16 branch. #18 and #19 merge cleanly with each other. Their "conflicts" with #14/#20/#21/#31 are inherited from #16's own edits to R and D (#18 and #19 touch no R or D themselves), so they disappear once #16's commits are in main.
- #21 is a hidden second stack: it contains #17's first commit `08355ae` and is based on main. It must follow #17 (and #15, #12 because of S and P).
- No other stacked PRs. #13, #14, #15 and #12 are independent of the stacks.

Sequential simulation (S15, order 20, 12, 13, 15, 17, 16, 14, 18, 19, 21, 31; it differs from the plan below only in the relative position of #17/#16 and #14) found only these conflict points: #15 (S), #17 (S, P), #16 (R), #14 (R), #21 (R, C), #31 (A, M, D). #18 and #19 were clean after #16. Pairwise results (S8) are the authority for each step.

## 3. Merge order, requests and timeline

CR request types used below:
- CHAT = one PR-level `@coderabbitai` comment listing threads and the head SHA, asking CR to reply "resolved" or what is missing. At 15:21Z the lead did this on #12/#13/#17; CR answered in each thread at 15:22-15:26Z while the review limit was exhausted (S3, S4). Treated as not consuming a review slot (not documented, see section 5).
- REVIEW = `@coderabbitai review` (full review; consumes a slot). Budget: at most 2 per rolling hour.

Default step recipe after #20: (1) if conflicting, update the PR branch by merging main into it (no force-push, so the `Fixed in <sha>` replies stay valid), (2) refresh the stale PR body (an `edited`/`labeled` event also triggers `docs`), (3) add `full-gate` on the final candidate (code PRs; ~11 min), (4) merge with a MERGE COMMIT when `gate` and `docs` are green and every thread is CR-confirmed. Wait for the push-to-main fast gate on main to go green between merges when the next PR touches the same area.

| # | Merge | Why this position | CR request needed | Update after previous merge | `full-gate` |
| --- | --- | --- | --- | --- | --- |
| 1 | **#20** | Creates the `docs` check every other PR needs (B1). CLEAN, 0 threads. | **Owner rule (2026-10-03): merge only after CodeRabbit reviews and confirms.** #34 (always-report gate, dispatch-only full tier, Node 24; fixes B2) is folded into #20 before its first review if its live full-tier run passes, so one review covers both; request at the ~16:08Z slot. | None | Yes, once (S12 shows only the fast tier ran on `7da12cd6c`, with firefox/webkit skipped, so the new full-tier wiring is unexercised in the visible runs). Skip only if owner wants to save ~25 runner minutes. |
| 2 | **#12** | Docs-only, CR-confirmed, no update needed; defines the review doc that #15/#17/#21 extend. | None (thread confirmed at head). | None. Needs `docs` triggered by a label or body edit. Do NOT push a new commit (docs-only push would have no `gate`, B2); the existing `gate` pass on `a9276f6` stays valid. | No (docs-only) |
| 3 | **#13** | Independent; sets Node 22 for later CI runs. | None (CR withdrew). | None (clean vs main after #20) | Yes |
| 4 | **#15** | Fail-closed beta mode changes test fixtures; later PRs (#17, #21) add sign-up tests and should adapt to it. | None (0 threads; CR reviewed head). | Merge main: S conflict, resolve by taking #15's file (it is #12's text plus 14 added lines, 0 deletions). | Yes |
| 5 | **#16** | P1 and base of #18/#19. Independent of #15 and #17, can run in parallel with #15. | CHAT for T1+T2 at head `b63ffed`, sent early (before step 1). REVIEW only if a slot is free (new Caddy commit unreviewed). | Merge main: R conflict. Merge with a merge commit; after merge run `gh pr edit 18 --base main` and `gh pr edit 19 --base main` (or delete #16's branch, which GitHub retargets automatically). | Yes |
| 6 | **#17** | P1; after #15 because of S and `p3-sso.test.ts`. | None (5/5 confirmed). | Merge main: S (union of #15's and #17's added lines) and P (real merge; keep both fixture changes). Re-run integration. | Yes |
| 7 | **#19** | Smaller of the stack; no conflicts. | CHAT for T1 at head `1c6dcef`. | After retarget: none. Needs `docs` triggered (retarget is an `edited` event). | Yes (first full tier, it only had fast) |
| 8 | **#18** | Largest (migration 0024, 10 artifact files); last of the stack so its review can land first. | CHAT for T1+T2 at head `a8d7e53`; REVIEW recommended (3 unreviewed commits incl. the counters rewrite). T1 may stay open (env spread). | None after retarget | Yes |
| 9 | **#14** | P2; its R conflict resolves once #16 is in. Merge only after the owner/lead accepts the open WebKit question (`status: blocked`, S6). | None (0 threads). | Merge main: R conflict | Yes (gives a second WebKit sample, not a fix) |
| 10 | **#21** | Long pole; needs #17, #15, #12, #16, #14 in main to avoid repeated rebases. | After fixing the 7 findings and CI: reply `Fixed in <sha>` per thread, then CHAT (or REVIEW). REVIEW recommended (security, 7 findings). | Merge main: R, C, S, P. Drop duplicated #17 content (T5/T7 vanish). | Yes |
| 11 | **#31** | Docs-only with the most conflicts; merging last means resolving them once. | None required (0 threads, no review exists). | Merge main: A, M, D. Then `gate` will not run (B2): dispatch `gate.yml` on the branch (fast tier) and trigger `docs`. | No (docs-only) |

### Timeline (UTC, estimates)

Assumptions: fast gate about 6 min wall, full gate about 11-12 min wall (webkit 8-11 min in S2), docs check about 10 s, lead acts promptly.

| Time | Action |
| --- | --- |
| 15:45 | CHAT on #16, #18, #19 (3 comments). Add `full-gate` to #20. Start fixing #21 (CI plus 7 threads) and refresh stale PR bodies. |
| ~15:58 | #20 full gate green: merge #20. |
| ~16:00 | Trigger `docs` on #12-#17, #21, #31 (body edit or label). Merge #12 once `docs` is green. Update #15 and #16 (conflicts); add `full-gate` to #13, #15, #16. |
| 16:08 | First CR review slot (notice, S4). REVIEW #21 on the fixed head (or #18 if #21 is not ready). |
| ~16:13 | Second slot is not known (see section 5). If available, REVIEW #18. Otherwise next slots at about 17:08. |
| ~16:15-16:20 | Merge #13, #15, #16 (when each full gate is green). Retarget #18/#19. Update #17 (S, P conflicts); add `full-gate` to #17, #19, #18. |
| ~16:35 | Merge #17, #19, #18. Update #14, `full-gate`. |
| ~16:50 | Merge #14 (if accepted). Update #21 on main, `full-gate`. |
| ~17:10-17:45 | Merge #21 (earliest; depends on CI fix and CR confirmation of 7 threads). |
| ~17:45-18:00 | Update #31, dispatch `gate`, trigger `docs`, merge #31. |

Reviews planned: R1 (about 16:08) #21, R2 (about 16:13 if CR grants it) #18. That is 2 in the hour starting 16:08, within both the owner's 3 and CR's stated 2. #16, #19, #20 and #31 would merge without a full CR review of their newest commits; only thread confirmation (CHAT) is required by the owner rule.

## 3b. Blockers (ranked)

- B1. `docs` is a required check but `docs.yml` exists only on #20's branch (S10), so #12-#17, #21, #31 stay BLOCKED until #20 merges. No bypass actors (S9). After #20 merges, the check appears on existing PRs only on a new event (`opened, synchronize, reopened, ready_for_review, labeled, unlabeled, edited`, S10).
- B2. #20's `gate.yml` has `paths-ignore: docs/**, artifacts/**, **/*.md, design-reference/**` on `pull_request` (S10). A PR whose files are all ignored never reports the required `gate` (GitHub leaves it pending). #20's own body lists this as a known follow-up. Affects #31 after it is updated and #12 if anyone pushes to it. Cheapest fixes: replace `paths-ignore` with an always-reporting `changes` job before merging #20, or dispatch `gate.yml` on the branch.
- B3. #21: CI red, 7 unresolved threads with no reply, and a stale copy of #17's code (S13).
- B4. CR confirmation gaps: #16 (2), #18 (2), #19 (1) were resolved by us with deferral or "not changed" replies and CR never confirmed; CR also has not seen their newest commits. #20 and #31 were never reviewed. CR allowance is 2/hour and the next slot is about 16:08Z.
- B5. Cross-PR conflicts needing manual resolution and a fresh CI cycle each (S, P, R, C, A, M, D above), plus the stack needs merge commits (not squash) so #18/#19 do not re-conflict.
- B6. #14 carries `status: blocked` and an open WebKit diagnosis (S6). Current head is green, which is one sample, not a root cause.

## 4. Draft PRs (S1, S6, S8, S13)

| PR | What it is | Recommendation |
| --- | --- | --- |
| #7 | Review-only PR "four-file Company Builder tail (do not merge)", base `codex/cb-review-baseline-20261003`. Its head `719056cef` and its base branch are both ancestors of `origin/main`; #2 is already merged (`9fdcb7d`). | **Close.** Purpose consumed; keep nothing. Branch cleanup is optional. |
| #9 | Pi tunnel runbook, backups/restore tools (27 files). Own body states an unresolved WebKit `ECONNRESET` (`e2e/phase3.spec.ts:88`, run 37081791704) as a merge blocker; owner-blocked deploy/DNS items. Clean vs main; conflicts with #16/#18/#19/#21 in PRIVATE_BETA_RUNBOOK.md. 3 commits behind main. | **Keep as draft.** Rebase onto main after #21 and #31, then decide. Marking it ready triggers an automatic CR review (config `auto_review.enabled: true`, S11), which uses a slot. |
| #10 | Field-validation v2 harness (25 files, +2714). Its real run failed 8/10 (product finding, not a harness bug). No conflicts. | **Keep as draft.** P3, needs owner decision on the VP-05/VP-06 finding. Rebase after the pilot stack; one CR slot when it is made ready. |
| #11 | Verifier for preserved test ciphertext (12 files). DV2-02 remains PARTIAL per its body. No conflicts. | **Keep as draft.** P3. Rebase after the pilot stack; one CR slot when made ready. |

## 5. Not verifiable from here

1. What consumed the two CR slots. The lead's log `coderabbit-requests.log` (scratchpad) lists 14:20:19, 15:13:20 (x2) and 15:19:31 UTC; if CR uses a 60-minute rolling window, "next review in 55 minutes" at 15:13:34Z would imply a consumption near 15:08Z that no log shows (inference). The time of the second free slot is therefore unknown (about 16:08 is solid, about 16:13 is a guess). CR says the allowance is derived from "52 included PR review attempts over the past 7 days" (53 at 15:19:53Z), so it can change.
2. Whether CHAT replies spend plan limits. Observed: three replies at 15:22-15:26Z after the limit notices. Not documented; `.coderabbit.yaml` comments claim thread replies do not spend chat messages (S11).
3. Whether `docs` attaches to existing PR heads on a label or body edit. Expected from `docs.yml` triggers and from `pull_request` using the merge-commit workflow file; not tested. Fallback: close and reopen (`reopened` is a trigger).
4. Whether a `workflow_dispatch` run of `gate.yml` satisfies the required `gate` on a docs-only head. Expected (checks are matched by name on the commit); not tested. That a path-filtered workflow leaves its required check pending is GitHub's documented behaviour (from memory of the docs), not observed on this repo; #20's own body states the same limitation.
5. The meaning of the ruleset parameter `require_extra_approval_for_unattributed_changes: true` (S9); 0 approvals are required, so it is assumed not to block.
6. The names of the failing #21 tests. S14 logs show only counts; the `summary.json` artifacts were not downloaded.
7. Whether CR will confirm #16 T2, #18 T1 (env spread) and #19 T1. Only the code facts in section 1 were read.
8. Whether the semantic interaction of #15's fail-closed beta mode with sign-up tests added by #17/#21 is clean. The simulation is textual; the simulation carried conflict markers forward, so file lists for later steps may be incomplete. Inference only.
9. The full CI results quoted for #12-#17, #31 and #21 ran on the old `gate.yml` (full tier for any PR into main) against main `9641ad1`. Rule 4 requires a fresh `full-gate` run on the final candidate under the new workflow.
10. GitHub's automatic retarget of #18/#19 when #16's branch is deleted (documented GitHub behaviour, not tested here). The plan uses explicit `gh pr edit --base main` as the safe path.
11. All time estimates. CI durations come from `gh pr checks` output (S2); lead response time is unknown.
12. Code semantics of #21 (H3 MFA fix), #18 (counters, migration) and #19 were not reviewed in this audit.

## Sources (all read-only, run at 15:31-15:45 UTC)

- S0: `git fetch origin`; `git show origin/claude/docs-freshness:docs/GITHUB_WORKFLOW.md`; AGENTS.md in this worktree.
- S1: `gh pr list -R AbdelrhmanAh7/FlowLine_Web --state open --json number,title,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,headRefOid`; `gh pr view N --json commits,files,labels,milestone,body`.
- S2: `gh pr checks N -R AbdelrhmanAh7/FlowLine_Web` for N in 12-21, 31 (and 7, 9, 10, 11).
- S3: `gh api repos/AbdelrhmanAh7/FlowLine_Web/pulls/N/reviews --paginate`.
- S4: `gh api repos/AbdelrhmanAh7/FlowLine_Web/issues/N/comments --paginate` (limit notices: #20 comment 5970461880, #31 comment 5970512600; CR chat replies 5970534135, 5970537891, 5970539795).
- S5: `gh api graphql` with `reviewThreads(first:100){nodes{isResolved isOutdated path line comments(first:30){nodes{createdAt author{login} body commit{abbreviatedOid}}}}}` for each PR.
- S6: `gh pr view N --json body`; `git show origin/codex/pilot-security-deps-round1:docs/implementation/WEBKIT_14_DIAGNOSIS.md`; `gh label list`.
- S7: `gh api --paginate --slurp repos/AbdelrhmanAh7/FlowLine_Web/pulls/N/files`, evaluated with the regex from S10 `scripts/ci/docs-check.mjs`.
- S8: `git merge-tree --write-tree --name-only origin/<A> origin/<B>` for all pairs and against `origin/main` (exit code 1 = conflict).
- S9: `gh api repos/AbdelrhmanAh7/FlowLine_Web/rules/branches/main`; `gh api repos/AbdelrhmanAh7/FlowLine_Web/rulesets/24420405`; `gh api repos/AbdelrhmanAh7/FlowLine_Web --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,delete_branch_on_merge,allow_update_branch}'`.
- S10: `git show origin/claude/ci-trim-20261003:.github/workflows/{docs,gate}.yml`; `git show origin/claude/ci-trim-20261003:scripts/ci/docs-check.mjs`; `git ls-tree --name-only origin/main .github/workflows/` (main has only `gate.yml`).
- S11: `git show origin/main:.coderabbit.yaml`.
- S12: `gh api repos/AbdelrhmanAh7/FlowLine_Web/commits/7da12cd6c/check-runs --paginate`.
- S13: `git merge-base --is-ancestor <sha> origin/<branch>`; `git rev-list --count origin/main..origin/<branch>`; `git log --merges origin/main`.
- S14: `gh run view 37132472664 -R AbdelrhmanAh7/FlowLine_Web --log-failed`.
- S15: sequential merge simulation with `git merge-tree --write-tree` plus `git commit-tree` (dangling objects only, no refs changed), order 20, 12, 13, 15, 17, 16, 14, 18, 19, 21, 31.
