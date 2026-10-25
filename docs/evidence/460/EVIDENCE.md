# Verification report — issue #460

Supersedes part of #458. Origin: [review finding](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/458#issuecomment-6384391952).
No originating Sentry issue was supplied; this is a workflow documentation defect.

## Acceptance criteria

1. AC1: Document required-check and rollup commands, with explicit success and missing/pending failure interpretation.
2. AC2: Verify full-tier runs using current PR SHA, dispatch event, successful conclusion and successful Firefox/WebKit jobs, without relying on run titles or only the latest dispatch.
3. AC3: Record actual required-check results for #360, #330 and #308 outside the long-lived workflow guide.
4. AC4: Cover the documentation regression and record base/head results and local checks.

## Observed verification — 2026-10-25

Starting HEAD: `ce36f82095fc34839811cb0e5fb23c4691b05f1b`.
Base main: `a86674a88c107bcd5c853690faf98616598354ae`.
This report replaces the earlier unverified grep counts and inherited test claims.

| AC | Command / evidence | Observed result |
| --- | --- | --- |
| AC1, AC2, AC4 | `nice -n 10 pnpm exec vitest run tests/unit/github-workflow-gate.test.ts --maxWorkers=2` | Revised assertion against inherited guide: exit 1, 1 failed / 8 passed; revised final suite against main guide: exit 1, 7 failed; fixed guide: exit 0, 7 passed |
| AC2 | Read `.github/workflows/gate.yml`, Firefox/WebKit conditions | Both require dispatch with `inputs.tier == 'full'`; no `run-name` supplies a tier title |
| AC3 | `gh pr checks 360 --required` | exit 1: gate fail, docs pass; [gate job](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/39783259780/job/119842125338) |
| AC3 | `gh pr checks 330 --required` | exit 1: gate fail, docs pass; [gate job](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/39725639794/job/119649874842) |
| AC3 | `gh pr checks 308 --required` | exit 1: gate fail, docs pass; [gate job](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/39713951753/job/119613053557) |
| AC4 | `pnpm typecheck` | exit 0 |
| AC4 | `pnpm lint` | exit 0 |

The base check temporarily substituted `git show main:docs/GITHUB_WORKFLOW.md` for the guide and ran the same final test file, then restored the fixed guide. No checkout or base files were committed.
Changed covering test: `tests/unit/github-workflow-gate.test.ts` (7 tests); checks workflow conditions as well as documented commands. These are documentation guards, not proof that remote workflows passed. No full-tier run was dispatched in this task.

Environment: Node 26.10.0 (package requests Node 24.x); pnpm 10.32.1. The sandbox rejected nice priority adjustment; tests still executed. Full suite/build deferred to hosted CI per owner instruction.

## PR handoff

Closes #460. Refs #449. Supersedes part of #458.
E2E: not needed — documentation and documentation guard tests only; no application flow changed. No UI screenshots or Arabic RTL/LTR validation apply.
Security posture: no dependencies, secrets, permissions or workflow files changed. Reused existing gh CLI, Vitest and Node filesystem helpers.
The stale unverified status line was already removed in the inherited commits; this change also removes duplicate PR-specific status prose and issue-specific AC labels from the guide. No review threads were resolved by this implementer.

Skills used: model-effort-routing, diagnosing-bugs, systematic-debugging, opencode-delegate (inline exception for the small command correction), humanizer, typescript-best-practices, principle-type-system-discipline, verification-before-completion. Peak selector could not create its state lock in the sandbox; no helper was launched.
