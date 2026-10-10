# Prep for #67: Document and unit-test the pnpm wt worktree helper

> Offline floor prep (2026-10-10T08:32Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (9 of 7 week-points today; opencode: held until 09:21Z (opencode rate-limited 4× in a r; agy: held until 10-14 14:35Z (4 d 6 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

## Context
The CI & repo workflow milestone includes `pnpm wt` worktrees. The helper needs documented behaviour and test coverage so contributors and AI engineers can rely on it.

## Scope
Touch only the wt script, its tests, and docs. Do not edit CI or workflow files.
- Add unit tests for the argument parsing and path/branch-name derivation logic, with git calls stubbed.
- Cover create, list, and remove, plus error cases: dirty worktree, existing branch, invalid name.
- Add a short docs section with usage examples and the safety rules, for example that remove refuses to delete a worktree with uncommitted changes.

## Acceptance criteria
- [ ] Tests cover create, list and remove, and the three error cases above.
- [ ] `pnpm wt remove` on a dirty worktree is refused with a clear message, and a test asserts this.
- [ ] Docs section added with copy-pasteable examples, and the mandatory docs check passes.
- [ ] No changes under .github/workflows.
- [ ] Change is ≤ ~300 lines and fits in one PR.

## Test plan
Run the new unit tests. Manually run `pnpm wt` create, list and remove in a scratch clone and confirm the output matches the docs.

<!-- nql-generated -->
<sub>Drafted by the Tech Lead from the roadmap while the queue was empty (claude-cli); backlog triage decides whether the AI engineers take it.</sub>

## Acceptance checklist

- [ ] Tests cover create, list and remove, and the three error cases above.
- [ ] `pnpm wt remove` on a dirty worktree is refused with a clear message, and a test asserts this.
- [ ] Docs section added with copy-pasteable examples, and the mandatory docs check passes.
- [ ] No changes under .github/workflows.
- [ ] Change is ≤ ~300 lines and fits in one PR.

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/workflows/gate.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test case**: `create_worktree_valid_branch`  
  **Setup**: Mock git with valid branch, no existing worktree.  
  **Assertion**: Worktree created, no errors.  
  **File**: `tests/unit/wt-create.test.ts`  

- **Test case**: `create_worktree_existing_branch`  
  **Setup**: Mock git with existing branch.  
  **Assertion**: Error: branch already exists.  
  **File**: `tests/unit/wt-create.test.ts`  

- **Test case**: `create_worktree_invalid_name`  
  **Setup**: Mock git with invalid name.  
  **Assertion**: Error: invalid worktree name.  
  **File**: `tests/unit/wt-create.test.ts`  

- **Test, case**: `remove_worktree_clean`  
  **Setup**: Mock git with clean worktree.  
  **Assertion**: Worktree removed.  
  **File**: `tests/unit/wt-remove.test.ts`  

- **Test case**: `remove_worktree_dirty`  
  **Setup**: Mock git with uncommitted changes.  
  **Assertion**: Error: cannot remove dirty worktree.  
  **File**: `tests/unit/wt-remove.test.ts`  

- **Test case**: `list_worktrees`  
  **Setup**: Mock git with multiple worktrees.  
  **Assertion**: List of worktrees returned.  
  **File**: `tests/unit/wt-list.test.ts`  

- **Test case**: `parse_arguments_invalid`  
  **Setup**: Invalid command-line arguments.  
  **Assertion**: Error: invalid arguments.  
  **File**: `tests/unit/wt-args.test.ts`  

- **Test case**: `parse_arguments_valid`  
  **Setup**: Valid command-line arguments.  
  **Assertion**: Parsed arguments match expected.  
  **File**: `tests/unit/wt-args.test.ts`  

- **Test case**: `derive_path_and_branch_valid`  
  **Setup**: Valid branch and path.  
  **Assertion**: Derived path and branch match.  
  **File**: `tests/unit/wt-derive.test.ts`  

- **Test case**: `derive_path_and_branch_invalid`  
  **Setup**: Invalid branch or path.  
  **Assertion**: Error: invalid path or branch.  
  **File**: `tests/unit/wt-derive.test.ts`
