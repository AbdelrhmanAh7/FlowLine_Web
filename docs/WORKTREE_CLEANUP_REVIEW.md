# Worktree cleanup review

Read-only inventory captured 2026-10-01. Compared branch divergence against `main` at `9324b1fed677f03e8c044eb1373b8577167abeb5`. Counts are committed commits reachable only from the indicated side; `dirtyTracked`/`untracked` are porcelain status rows. No secret files or generated directories were opened.

| Resolved path | Branch / state | HEAD | Unique vs main (this / main) | Worktree status |
|---|---|---|---:|---|
| `C:\Users\Abdelrahman\Desktop\Personal_Project\FlowLine` | `codex/company-builder-continuation` | `766ff3ce8060a4caf35d8e75d969fca68d97f51a` | 51 / 0 | DIRTY: 33 tracked rows, 15 untracked rows |
| `C:\Users\Abdelrahman\.codex\worktrees\2d36\FlowLine` | detached | `8622dcfa0ecb8834cd9a652ee59c055fcdcda3ef` | 0 / 106 | clean |
| `C:\Users\Abdelrahman\.codex\worktrees\main-integration\FlowLine` | `main` | `9324b1fed677f03e8c044eb1373b8577167abeb5` | 0 / 0 | clean |
| `C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-aihub` | `ai-hub` | `d70c2cc07bd06fb4dcbd90be207d554c2cef46c8` | 0 / 6 | clean |
| `C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-cleanup` | `codex/cleanup-inventory` | `766ff3ce8060a4caf35d8e75d969fca68d97f51a` | 51 / 0 | clean at capture (this report will make it dirty) |
| `C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-design` | `design-v2` | `b40cb386f6a8d6dbf7d894f4fe1ecc3e88232835` | 0 / 2 | DIRTY: 63 tracked rows, 99 untracked rows |
| `C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-zitadel` | `codex/zitadel-pilot` | `766ff3ce8060a4caf35d8e75d969fca68d97f51a` | 51 / 0 | clean |

Every listed Git worktree is registered in `git worktree list --porcelain`. The status above is `git status --short`; no worktree showed a lock/prunable marker in the listing. Three branch refs (`codex/company-builder-continuation`, `codex/cleanup-inventory`, `codex/zitadel-pilot`) point to the same 51-commit-ahead SHA, so retain at least one reachable ref to that history. The `design-v2` branch has no commits unique to it relative to main, but its dirty/untracked content is extensive and includes many screenshots and browser result directories; it requires preservation before removal. The detached `2d36` and `ai-hub` commits are ancestors of main by the reported divergence and have no unique commit history against main, but retain until their owners confirm the work is disposable.

## Unregistered adjacent directory

`C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-aib` exists as a plain directory and is not a Git worktree (`git rev-parse` failed). Its immediate directory listing was empty. It may be an abandoned failed worktree setup; confirm before cleanup.

## Active processes

At capture, the main `FlowLine` checkout had active processes with command lines pointing to its files: Next server on port 3100 (PID 43280), worker (PID 75096), provider fake on 4010 (PID 58268), AI fake on 4011 (PID 65516), plus several TSX/esbuild, engine sandbox, and Playwright worker processes (PIDs 62808, 91780, 83644, 36088, 73288, 44080). These are active checkout users; stop/identify them before removing the main checkout or its dependencies. No active process command line was found for the other named worktrees in the focused scan.

## Preservation hazards / cleanup order

1. Preserve the main checkout's 48 dirty entries (33 tracked + 15 untracked) before any deletion. Some entries include UI changes and new docs/scripts; filenames are intentionally omitted here to keep this report concise.
2. Preserve all 162 dirty entries in `FL-wt-design` (63 tracked + 99 untracked), including generated screenshot/browser evidence and `KIMI_RESUME.md`. Avoid flattening or filtering without owner review.
3. Keep a branch/archive ref to `766ff3ce8060a4caf35d8e75d969fca68d97f51a` before deleting any of the three refs pointing there. Record the design SHA and detached SHA in durable refs if cleanup will remove their worktree metadata; current divergence indicates neither has commits unique against main, but preserve their identity until cleanup is complete.
4. `FL-wt-cleanup` is the isolated report worktree. This report is uncommitted by design; preserve/copy it before deleting this worktree.
5. No worktree was deleted, modified, committed, or tested as part of this inventory.

## Completed cleanup

Only the main FlowLine checkout remains registered. All branch refs remain, plus preserve/20261001-detached-2d36. The design work is preserved in C:/Users/Abdelrahman/.codex/worktree-backups/20261001-flowline/design-v2-preserved.zip (14,050 files, ZIP CRC verified) and the named preserved-design-before-worktree-cleanup-20261001 Git stash. The cleanup report and imported ZITADEL changes also have named preservation stashes; ZITADEL has a separate binary patch.

Git removed completed helper, design, main-integration and detached checkouts. FL-wt-aihub was deregistered but Windows could not remove long dependency paths. Automatic approval review rejected subsequent recursive deletion/move commands with only blocked by policy, so unregistered dependency remnants in FL-wt-aihub and FL-wt-design, and the empty FL-wt-aib folder, remain. No unpreserved source was discarded.

The later copy-editor, platform-auth and UX-pages worktrees were imported, preserved in named Git stashes and removed cleanly. Dependency junctions were verified and removed without traversing their targets. Final git worktree list contains only FlowLine.


The final background-v2, shared-forms and ux-icons workers were imported into the main checkout, preserved with include-untracked named stashes, and removed with ordinary git worktree remove. The final 2026-10-01 listing again contains only FlowLine.
