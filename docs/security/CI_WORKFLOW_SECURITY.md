# CI Workflow Security & Untrusted Code Isolation (Audit #298)

This document records the security posture, trigger event constraints, checkout references, and fork PR isolation mechanisms in FlowLine's GitHub Actions workflows (`.github/workflows/gate.yml` and `.github/workflows/claude.yml`). It addresses and resolves QA checklist finding on PR #271 / Issue #250 ([CodeRabbit discussion r4261434365](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/271#discussion_r4261434365)).

## 1. Scope and Threat Model

Evaluating GitHub Actions workflows for untrusted code execution requires verifying:
1. **Trigger Events**: Workflows must not use `pull_request_target` to execute untrusted code in a privileged context.
2. **Checkout References**: Actions must not check out untrusted PR head code in jobs that have access to repository write tokens or secrets.
3. **Fork PR Isolation**: Pull requests from forks must never obtain elevated permissions, repository secrets, or the `CLAUDE_CODE_OAUTH_TOKEN`.
4. **Step Gating**: Actions consuming sensitive credentials must be guarded behind deterministic gate outputs.

---

## 2. Gate Workflow (`.github/workflows/gate.yml`)

### Triggers (`gate.yml:3-16`)
- `pull_request`: `types: [opened, synchronize, reopened, ready_for_review]`
- `push`: `branches: [main]`
- `workflow_dispatch`: `inputs: { tier: [fast, full] }`
- **Result**: No `pull_request_target` trigger.

### Permissions & Secrets (`gate.yml:18-19, 43-45`)
- Root permissions: `contents: read`.
- Secrets: No repository secrets are accessed. Only `GH_TOKEN: ${{ github.token }}` (read-only for pull requests) is used.
- Job permissions: Only the `changes` scope job receives `pull-requests: read`. Test runners operate with read-only access.

### Checkout Reference (`gate.yml:49-53, 112-114`)
- On `pull_request`: `actions/checkout` checks out `refs/pull/<pr>/merge` with `persist-credentials: false` and `fetch-depth: 1`.
- The checkout runs with untrusted code, but in a standard unprivileged `pull_request` context with no repository secrets and read-only token permissions.

---

## 3. Claude Action Workflow (`.github/workflows/claude.yml`)

### Triggers (`claude.yml:16-26`)
```yaml
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request_review:
    types: [submitted]
  issues:
    types: [opened]
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
```
- **Result**: `pull_request_target` is NOT used anywhere in `claude.yml`.

### Interactive/Mention Job: `claude` (`claude.yml:29-103`)
- **Actor Write Permission Gate (`claude.yml:64-65`)**:
  Queries GitHub API `repos/$REPO/collaborators/$ACTOR/permission` and enforces `admin|maintain|write`. Untrusted actors commenting `@claude` are rejected before any checkout or model execution.
- **Fork PR Isolation (`claude.yml:66-69`)**:
  If a comment event occurs on a pull request, the gate step inspects `head.repo.full_name`:
  ```bash
  head_repo="$(gh api "repos/$REPO/pulls/$PR_NUMBER" --jq '.head.repo.full_name // ""')"
  [ "$head_repo" = "$REPO" ] || skip "PR #$PR_NUMBER does not come from a branch of this repo (fork) - never run."
  ```
  Fork PRs are strictly rejected, preventing fork authors from triggering interactive Claude runs.
- **Checkout Reference (`claude.yml:90-95`)**:
  `actions/checkout` specifies no custom ref, defaulting to the base repository default branch (`refs/heads/main`). It does NOT check out the untrusted PR head branch.
- **Credential Protection (`claude.yml:51, 63, 97-100`)**:
  Gated behind `[ "$HAS_TOKEN" = "true" ]` and `if: steps.gate.outputs.run == 'true'`.

### Automated Review Job: `review` (`claude.yml:104-172`)
- **Job Pre-filter (`claude.yml:106-110`)**:
  ```yaml
  if: >-
    github.event_name == 'pull_request' &&
    github.event.pull_request.head.repo.full_name == github.repository &&
    github.event.pull_request.draft == false &&
    !startsWith(github.event.pull_request.head.ref, 'ai/')
  ```
  The job explicitly filters on `head.repo.full_name == github.repository`. Any PR originating from a fork evaluates to `false` and allocates no runner.
- **GitHub Actions Secret Isolation**:
  Because the trigger is standard `pull_request` (not `pull_request_target`), GitHub Actions never provisions repository secrets (including `CLAUDE_CODE_OAUTH_TOKEN`) to workflows triggered from forks.
- **Permissions (`claude.yml:116-121`)**:
  `contents: read`, `pull-requests: write`, `issues: write`, `id-token: write`, `actions: read`. Does not have `contents: write`.
- **Checkout Reference (`claude.yml:131-136`)**:
  Runs on internal branch `refs/pull/<pr>/merge` only after the `head.repo.full_name == github.repository` pre-filter passes.

---

## 4. Verification and Automated Invariants

Automated unit tests in `tests/unit/ci-workflows.test.ts` permanently enforce:
1. Complete exclusion of `pull_request_target` from all workflow files.
2. Exact trigger event allowlists for `claude.yml`.
3. Collaborator write-permission and fork repository validation in the `claude` job gate step.
4. Internal repository filtering (`head.repo.full_name == github.repository`) in the `review` job.
5. Strict step gating on `steps.gate.outputs.run == 'true'`.
6. Negative controls rejecting insecure workflow variations.
