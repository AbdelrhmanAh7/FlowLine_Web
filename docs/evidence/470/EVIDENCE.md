# Verification report — issue #470

Supersedes part of #262. Refs #470. Refs #199.
Origin: [CodeRabbit finding](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/262#discussion_r4350022255).
No originating Sentry issue was supplied; this is an evidence documentation finding.

## Acceptance criteria

1. AC1 / REQ-1: Record a full, immutable tested commit SHA, never a moving reference.
2. AC2 / REQ-2: Omit the duplicate engine entry; retain the existing caveat in `docs/implementation/PHASE4_BETA_REPORT.md`.
3. AC3 / REQ-3: Verify the finding against available code, record actual regression results, and preserve the parent branch without importing its unverified claims.

## Tested revision

- Commit SHA: `cd7bad12fb0f816ee04b525b82e2fee0bd8b83e2`

This is the starting revision, with the new documentation guard and this report as working-tree changes. It is not a claim that the parent MFA commands tested this revision.

## Finding disposition

`docs/evidence/199/EVIDENCE.md` is absent from current `origin/main` (the starting revision above). The fetched local `origin/ai/199` at `c35484a206bfb42cfb38e1ea850cf72cee991b8f` contains the reported moving reference and duplicate entry. Its historical command outputs do not identify the tested immutable commit. Replacing that reference with a guessed SHA would invent evidence. The parent-file edit is therefore inapplicable on this branch; this report records first-hand checks instead. No parent code, screenshots or test-success claims were copied into the deliverable.

The manager's proposed global scan would also reject unrelated historical reports, including #313's short SHA. The guard is scoped to this issue to keep the change minimal. It reads Markdown as data and never executes findings, paths or code from the report. Existing Vitest and Node filesystem helpers suffice; no dependency was added.

## Verification report

Command T: `nice -n 10 pnpm exec vitest run tests/unit/evidence-commit-sha.test.ts --maxWorkers=2`.

| AC | Command / input | Observed result | Exit code |
| --- | --- | --- | --- |
| AC1, AC2 | T on base documentation with the new test only | 2 failed: report absent (ENOENT) | 1 |
| AC1, AC2, AC3 | T with the exact parent report temporarily copied to the #470 report path | 2 failed: moving reference rejected; duplicate entry rejected | 1 |
| AC1, AC2 | T with this report | 2 passed, 0 failed | 0 |
| AC3 | `pnpm typecheck` | No type errors | 0 |
| AC3 | `pnpm lint` | No lint errors | 0 |
| AC3 | `git diff --check` | No whitespace errors | 0 |

The copied parent fixture was replaced before committing. The base run demonstrates a missing deliverable, not a product regression on main; the parent-fixture run reproduces the actual reported defects.
Changed covering test: `tests/unit/evidence-commit-sha.test.ts` (two documentation assertions). No application code or user-facing behavior changes.

## PR handoff

E2E: not needed — documentation and a documentation guard only; no application feature changes. UI screenshots and Arabic RTL/LTR checks do not apply.
Full suite/build are deferred to hosted CI per owner instruction. No claim of remote CI success or CodeRabbit confirmation is made. The optional local CodeRabbit review was not run.
Security posture: no dependencies, secrets, permissions, workflow tokens or CI configuration changed.

Skills used: using-superpowers, model-effort-routing, diagnosing-bugs, systematic-debugging, typescript-best-practices, principle-type-system-discipline, humanizer, verification-before-completion; opencode-delegate's inline exception applies to the 15-line guard.

Operational notes: #470 has no issue comments as read with `gh issue view 470 --json comments` (exit 0). Fresh `origin/main` equals the starting revision. Running-branch comparisons were unavailable because the advertised `ai/472` remote ref no longer exists; edits use issue-specific paths only. The sandbox refused nice priority adjustment, but the targeted tests ran to completion.
