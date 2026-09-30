# Worktree Inventory — 2026-09-30

## Summary Table

| Worktree | Branch | Status | Pushed | Size | Modified | Untracked | Stashes |
|----------|--------|--------|--------|------|----------|-----------|---------|
| FlowLine (main) | phase-4 | Clean | ✓ Yes | 3.7G | 0 | 0 | 2 |
| FL-wt-aihub | ai-hub | Clean | ✓ Yes | 3.6G | 0 | 0 | 2 |
| FL-wt-design | design-v2 | Dirty | ✗ No | 3.3G | 98 | 26 | 2 |
| FL-wt-aib (unregistered) | — | — | — | 163M | — | — | — |

## Registered Worktrees

### 1. FlowLine (main worktree)
- **Branch:** `phase-4`
- **HEAD:** `1a9883f` (phase-4: final release record + evidence)
- **Git Status:** Clean (0 modified, 0 untracked)
- **Ignored:** 12 files
- **Stashes:** 2 (stash@{0} and stash@{1} from codex-p3)
- **Pushed:** ✓ Yes — matches `origin/phase-4` exactly
- **Disk Size (excl. node_modules):** 3.7G
- **Notable Files:** Current production branch, no uncommitted work

### 2. FL-wt-aihub
- **Branch:** `ai-hub`
- **HEAD:** `d70c2cc` (docs: README for Phase 4 + AI provider hub)
- **Git Status:** Clean (0 modified, 0 untracked)
- **Ignored:** 8 files
- **Stashes:** 2 (stash@{0} and stash@{1} from codex-p3)
- **Pushed:** ✓ Yes — matches `origin/ai-hub` exactly
- **Disk Size (excl. node_modules):** 3.6G
- **Notable Files:** Clean worktree for AI hub branch, all work committed

### 3. FL-wt-design
- **Branch:** `design-v2`
- **HEAD:** `fb563e5` (Merge ai-hub into design-v2)
- **Git Status:** Dirty
  - **Modified:** 98 files (`.gitignore`, `package.json`, `playwright.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `e2e/helpers.ts`, etc.)
  - **Untracked:** 26 files
- **Ignored:** 10 files
- **Stashes:** 2 (stash@{0} and stash@{1} from codex-p3)
- **Pushed:** ✗ No — no upstream branch (`design-v2` not yet pushed to `origin`)
- **Disk Size (excl. node_modules):** 3.3G
- **Notable Untracked Files:**
  - `KIMI_RESUME.md`
  - `artifacts/design-v2/BUGS.md`, `NOTES.md`, `NOTES-draft.md`, `SONNET-REVIEW.md`
  - `artifacts/design-v2/chrome-qa/`, `closeout/`, `dv2-02/`, `gate/`, `tasks/`, `visual-review/`
  - `docs/design-system/`
  - `e2e/landing.spec.ts`, `reduced-motion.spec.ts`, `run-states.spec.ts`, `theme.spec.ts`
  - `src/app/design-system/`, `src/components/ui/focus-return.ts`
  - `scratch-css.mjs`, `scripts/check-evidence-secrets.mjs`

## Unregistered Folders

### FL-wt-aib
- **Status:** Orphaned (no `.git` file/folder) — NOT a registered worktree
- **Size:** 163M
- **Last Modified:** 2026-09-29 04:02 UTC (based on newest file in node_modules)
- **Git Configuration:** None (no `.git` link)
- **Top-Level Contents:**
  ```
  README.md
  SCOPE_MATRIX.md
  package.json
  playwright.config.ts
  pnpm-lock.yaml
  pnpm-workspace.yaml
  postcss.config.mjs
  tsconfig.json
  tsconfig.tsbuildinfo
  vitest.config.mts
  scripts/
  src/
  tests/
  worker/
  node_modules/
  ```
- **History Note:** Git history references merge of `ai-hub-aib` branch into `ai-hub` (commit ffdcd10), but that branch no longer exists and FL-wt-aib is not properly linked to git.

## Worktree Prune Status

Ran `git worktree prune --dry-run -v`:
- **Result:** No output (all registered worktrees are valid)

## Recommendations

| Folder | Recommendation | Reason |
|--------|----------------|--------|
| FlowLine | **Keep** | Main production branch (phase-4), clean, pushed. Required for normal development. |
| FL-wt-aihub | **Safe to remove** | Pushed branch (ai-hub), clean state. Can be recreated from `origin/ai-hub` if needed. 3.6G of disk space to recover. |
| FL-wt-design | **Keep (do NOT remove yet)** | Holds uncommitted design-v2 work (98 modified files, 26 untracked). Owner will commit this shortly per CLAUDE.md. Contains review artifacts and test evidence. After the design-v2 commit/merge, can be removed. |
| FL-wt-aib | **Safe to remove immediately** | Orphaned folder with no git linkage. Not a registered worktree. Appears to be stale artifact from merged `ai-hub-aib` branch. Can safely delete to recover 163M of disk space. |

## Notes
- All stashes are identical across worktrees (from codex-p3 work), likely copied during worktree setup
- FL-wt-design is the only worktree with uncommitted work per instructions (design-v2 branch to be committed by lead)
- Removing FL-wt-aihub and FL-wt-aib would recover ~3.76G of disk space
