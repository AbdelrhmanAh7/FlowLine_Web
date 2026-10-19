# Evidence — Issue #298: fix: AI_QUESTIONS.md: major (Claude Sonnet 5.5·medium): The 'no pullrequesttarget checkout … (split from #271)

Parent issue: #250
Split from: PR #271 ([CodeRabbit discussion r4261434365](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/271#discussion_r4261434365))
Originating Sentry issue: N/A (CI workflow security audit / QA review finding)
User-facing UI / Arabic: Exempt (internal CI workflow infrastructure and security audit; no user-facing UI or routes modified)

## Acceptance Criteria and Verification

| AC # | Acceptance Criterion | Verification Method | Result | Status |
|---|---|---|---|---|
| AC1 | **Workflow Triggers and Checkout Target Audit**: The QA checklist audit report explicitly details trigger events and checkout refs for both `.github/workflows/gate.yml` and `.github/workflows/claude.yml` with line citations, confirming that neither uses `pull_request_target`. | Verified via `docs/security/CI_WORKFLOW_SECURITY.md:15-84` and `artifacts/phase-4/issue-298/EVIDENCE.md`. Automated check in `tests/unit/ci-workflows.test.ts:610-622`. | `gate.yml` uses `pull_request`, `push`, `workflow_dispatch`. `claude.yml` uses `issue_comment`, `pull_request_review_comment`, `pull_request_review`, `issues`, `pull_request`. Neither uses `pull_request_target`. | PASS |
| AC2 | **Fork PR Isolation and OAuth Token Protection**: State checkout refs and verify fork PRs cannot reach `claude` or `review` jobs in `claude.yml` with `CLAUDE_CODE_OAUTH_TOKEN`. | Verified via `docs/security/CI_WORKFLOW_SECURITY.md:43-84`. Automated check in `tests/unit/ci-workflows.test.ts:624-656`. | `claude` job checks out base ref `github.sha`, rejects non-collaborators (`perm` in `admin\|maintain\|write`) and rejects fork PRs (`[ "$head_repo" = "$REPO" ]`). `review` job filters out forks in job `if:` (`head.repo.full_name == github.repository`). Secrets withheld by GitHub on forks. | PASS |
| AC3 | **Automated Invariant Unit Tests**: Dedicated unit tests in `tests/unit/ci-workflows.test.ts` assert and guard all trigger restrictions, checkout refs, permissions, and fork isolation mechanisms. | `pnpm exec vitest run tests/unit/ci-workflows.test.ts` | 16 new test assertions pass (98/98 total workflow tests pass). | PASS |
| AC4 | **Negative Controls & Regression Demonstration**: Ten negative control tests verify that unsafe trigger mutations, checkout ref modifications, permission escalations, or fork check removals cause test failures. | `tests/unit/ci-workflows.test.ts:658-672` running 10 negative control variations. | 10/10 negative controls pass, rejecting all insecure mutations. | PASS |
| AC5 | **Documentation and Progress Ledger**: Document workflow security in `docs/security/CI_WORKFLOW_SECURITY.md`, update `docs/implementation/PROGRESS.md`, update `NEXT_ACTION.md`, and pass mandatory docs check. | `node scripts/ci/docs-check.mjs` / `tests/unit/docs-check-script.test.ts` | 95/95 docs check unit tests pass; docs updated. | PASS |

---

## Test Execution Evidence

### 1. Workflow Security Invariants & Negative Controls
```bash
$ pnpm exec vitest run tests/unit/ci-workflows.test.ts
 ✓ |unit| tests/unit/ci-workflows.test.ts (98 tests) 867ms
   ...
   ✓ workflow triggers, checkout refs, and fork isolation invariants (#298) (16)
     ✓ gate.yml and claude.yml satisfy all untrusted code checkout and fork safety rules 2ms
     ✓ never uses pull_request_target in gate.yml or claude.yml 0ms
     ✓ claude.yml restricts triggers to issue_comment, pull_request_review_comment, pull_request_review, issues, and pull_request 0ms
     ✓ claude job checks out default ref (not PR head) and rejects fork PRs and non-writers at the gate 0ms
     ✓ review job runs only on internal branches, rejecting fork PRs before runner allocation with read-only contents 0ms
     ✓ both claude.yml jobs gate execution behind HAS_TOKEN and skip action steps when unset 0ms
     ✓ negative controls fail on unsafe triggers, ref mutations, or missing fork isolation (10)
       ✓ gate.yml uses pull_request_target 0ms
       ✓ claude.yml uses pull_request_target 0ms
       ✓ claude.yml adds unauthorized trigger 0ms
       ✓ claude job removes collaborator write check 0ms
       ✓ claude job removes fork PR check 0ms
       ✓ claude job checks out untrusted PR head 0ms
       ✓ review job removes internal repo condition 0ms
       ✓ review job requests contents: write 0ms
       ✓ review job removes HAS_TOKEN check 0ms
       ✓ claude-code-action unguarded without gate output 0ms

 Test Files  1 passed (1)
      Tests  98 passed (98)
```

### 2. Typecheck and Lint
```bash
$ pnpm typecheck && pnpm lint
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-298
> tsc --noEmit

> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-298
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0
```

### 3. Docs Check
```bash
$ pnpm exec vitest run tests/unit/docs-check-script.test.ts tests/unit/docs-index.test.ts
 Test Files  2 passed (2)
      Tests  99 passed (99)
   Duration  4.42s
```
