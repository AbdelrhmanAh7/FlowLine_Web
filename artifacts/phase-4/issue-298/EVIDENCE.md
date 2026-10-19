# Evidence: Issue #298 — CI Workflow Untrusted Code Isolation Audit

Tested revision: HEAD of branch `ai/298`
Parent issue: #250 (Split from PR #271, finding discussion r4261434365)
Scope: Resolve finding "no pull_request_target checkout of untrusted code", stating triggers, checkout refs, and confirming fork PR isolation from OAuth token.

## Findings and Audit Results

| Checklist Requirement | Status | Evidence / Citations | Explanation |
|---|---|---|---|
| No `pull_request_target` trigger | PASS | `.github/workflows/gate.yml:5-9`<br>`.github/workflows/claude.yml:16-26` | Neither workflow declares `pull_request_target`. Standard `pull_request` does not expose repository secrets to fork PRs. |
| Workflow triggers explicitly declared | PASS | `gate.yml:5-16`<br>`claude.yml:16-26` | `gate.yml`: `pull_request`, `push`, `workflow_dispatch`.<br>`claude.yml`: `issue_comment`, `pull_request_review_comment`, `pull_request_review`, `issues`, `pull_request`. |
| Checkout ref in `gate.yml` | PASS | `gate.yml:49-53, 112-114` | Checks out `refs/pull/<pr>/merge` (read-only token, `persist-credentials: false`, no repository secrets). |
| Checkout ref in `claude` job | PASS | `claude.yml:90-95` | `actions/checkout` without `ref:`, checking out default ref `github.sha` (`refs/heads/main`). Untrusted PR head is never checked out. |
| Fork PR isolation in `claude` job | PASS | `claude.yml:58-69` | Actor must have `admin|maintain|write` collaborator permission (`line 65`). If on a PR, head repo must equal base repo (`[ "$head_repo" = "$REPO" ]`, `line 68`). |
| Fork PR isolation in `review` job | PASS | `claude.yml:108, 123-129` | Filtered at job declaration: `github.event.pull_request.head.repo.full_name == github.repository`. Fork PRs evaluate to `false` and allocate no runner. Furthermore, GitHub Actions withholds secrets from fork PRs. |
| Least privilege permissions | PASS | `claude.yml:117` | `review` job has `contents: read`, never `contents: write`. |
| Step execution gating | PASS | `claude.yml:91, 97, 132, 138` | All external action steps (`actions/checkout`, `claude-code-action`) gate on `steps.gate.outputs.run == 'true'`. |

## Automated Invariants Coverage

All invariants are tested in `tests/unit/ci-workflows.test.ts`:
- 16 new test assertions under `describe("workflow triggers, checkout refs, and fork isolation invariants (#298)")`.
- 10 negative controls validating that any deviation (triggering on `pull_request_target`, omitting collaborator check, omitting fork check, checking out PR head ref, or granting `contents: write`) causes immediate test failure.
