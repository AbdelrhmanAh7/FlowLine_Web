# Branch inventory — verified against merged main

Observed 2026-10-03 in the docs worktree. Base: `main` / `origin/main` at `9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d`. Local refs below were checked with `git merge-base --is-ancestor <ref> <main>`; ancestry says whether a tip is contained in main, not whether its branch is safe to delete. GitHub PR state is linked below. Inventory only: no branches or worktrees were deleted.

## Tips verified as ancestors of main

- Company Builder stack refs: `pr/cb-4-evidence` (`8dbd8de81f61c4e105856e53bb87f482ed4965b8`), `pr/cb-3-docs-evidence` (`8d9221eee4fc02974fb02804e7171f003576ecb2`), `pr/cb-2-ui` (`a0a94a40b7ba62a95bf992b2ea82bbeca847a376`), `pr/cb-1-core` (`294063bcdd164e94723368badf03b20463120698`), and `codex/cb-review-repair-20261003` (`719056cefa9d9810f93ea8c917da2bda82fe2e4a`). PR #2 is merged, so these tips are now contained in main. Keep them pending root's cleanup decision and ownership checks.
- Historical refs `ai-hub` (`d70c2cc`), `design-v2` (`b40cb38`), `phase-2` (`7104c25`), `phase-3` (`8622dcf`), `phase-4` (`1a9883f`), `preserve/20261001-detached-2d36` (`8622dcf`), and `codex/takeover-security-20261003` (`9324b1f`) are ancestors of main. Preserve recovery/phase history; no deletion recommendation.

## Tips not ancestors of main — retain

- `codex/takeover-docs-20261003`: committed documentation candidate awaiting independent review and publication. Its tip is not yet contained in the merged main snapshot; retain its worktree until its own PR merges.
- `codex/takeover-beta-20261003` (`5be15b8`) and `codex/takeover-field-20261003` (`a7c2aef`): unmerged tips; preserve their worktrees and branches.
- `codex/company-builder-continuation` (`e690de6`), `codex/lighthouse-ci` (`bbf2c60`), and `codex/p3-polish` (`dd567a4`): older distinct tips not contained in main; compare/preserve, do not delete by inference.
- `codex/cleanup-inventory`, `codex/copy-editor`, `codex/ux-pages`, `codex/worktree-cleanup-review`, `codex/zitadel-pilot`, and `codex/zitadel-platform-auth` (each `766ff3c`): not contained in main; inspect/retain.

## PR state

- [PR #2](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/2) merged candidate `719056cefa9d9810f93ea8c917da2bda82fe2e4a` into main at `9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d`.
- [PR #3](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/3), [PR #4](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/4), and [PR #5](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/5) are merged. [PR #1](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/1) is closed as superseded.
- [PR #7](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/7) is review-only; do not merge. Its tail review covers the merged candidate.
- The remote `claude/company-builder-milestones-abc-pmba6v` was not locally available for ancestry verification; its PR #1 is closed. Do not consider it for deletion without a fresh remote check.

Recheck branch ownership and worktree registration before any later cleanup. Do not delete a result worktree before its own result PR merges.
