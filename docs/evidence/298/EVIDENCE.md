# Evidence: Issue #298 — CI Workflow Untrusted Code Isolation Audit

**Branch:** `ai/298`  
**Parent issue:** #250  
**Split from:** PR #271 (discussion r4261434365)  
**SHA at time of writing:** see `git log --oneline -1` on branch `ai/298`

This document supersedes the earlier draft at `artifacts/phase-4/issue-298/EVIDENCE.md` and the root `EVIDENCE.md`,
which contained blanket claims without per-item file:line evidence. Every item below cites the file and line verified
in the source, and notes the test that enforces it.

---

## Acceptance Criteria

| AC | Criterion |
|---|---|
| **AC1** | State the `on:` trigger events for `gate.yml` and `claude.yml`, with file:line citations. |
| **AC2** | State the ref each checkout uses, with file:line citations, and confirm no untrusted code is checked out with write access or secrets. |
| **AC3** | Confirm that fork PRs cannot reach the `claude` job with the OAuth token. |
| **AC4** | Clarify what the `review` job's gate step actually checks (token presence only, not collaborator write permissions). |
| **AC5** | Resolve the incomplete timeout check: document `firefox` and `webkit` job timeouts, and record the P1 finding that `chromium` uses 5 min unconditionally even on the full tier. |

---

## AC1 — Trigger events, with file:line

### `gate.yml` (`gate.yml:3–16`)

| Event | types |
|---|---|
| `pull_request` | `opened, synchronize, reopened, ready_for_review` |
| `push` | `branches: [main]` |
| `workflow_dispatch` | `inputs.tier: choice [fast, full]` |

`pull_request_target` is **absent**. Verified by `tests/unit/ci-workflows.test.ts` → *"never uses pull_request_target in gate.yml or claude.yml"* and *"gate.yml and claude.yml satisfy all untrusted code checkout and fork safety rules"*.

### `claude.yml` (`claude.yml:16–26`)

| Event | types |
|---|---|
| `issue_comment` | `created` |
| `pull_request_review_comment` | `created` |
| `pull_request_review` | `submitted` |
| `issues` | `opened` |
| `pull_request` | `opened, synchronize, ready_for_review, reopened` |

`pull_request_target` is **absent**. Verified by *"claude.yml restricts triggers to issue_comment, pull_request_review_comment, pull_request_review, issues, and pull_request"*.

**Result: AC1 PASS** — no `pull_request_target` trigger in either workflow.

---

## AC2 — Checkout refs, with file:line

### `gate.yml` checkout (`gate.yml:49–53`)

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
with:
  persist-credentials: false
  sparse-checkout: scripts/ci
```

The `pull_request` event checks out `refs/pull/<pr>/merge` (GitHub's read-only merge ref). No repository secrets are provisioned for standard `pull_request` events from forks. `persist-credentials: false` prevents the token from being written to `.git/config`.

### `claude.yml` interactive job checkout (`claude.yml:90–95`)

`actions/checkout` without a custom `ref:`. Defaults to `github.sha` on the base repository (the default branch). Does **not** check out the PR head. Verified by *"claude job checks out default ref (not PR head) and rejects fork PRs and non-writers at the gate"*.

### `claude.yml` review job checkout (`claude.yml:131–136`)

Runs only after the job-level `if:` filter (`head.repo.full_name == github.repository`) passes, ensuring fork PRs never allocate a runner. Checks out `refs/pull/<pr>/merge` with `fetch-depth: 1`.

**Result: AC2 PASS** — no untrusted PR head is checked out in a privileged context.

---

## AC3 — Fork PR isolation from OAuth token

### `claude` (interactive) job

Gate step (`claude.yml:63–69`):
1. Checks `[ "$HAS_TOKEN" = "true" ]` — exits early if token absent.
2. Queries `repos/$REPO/collaborators/$ACTOR/permission` and requires `admin|maintain|write`.
3. If the event is on a PR, checks `head.repo.full_name == github.repository`; fork PRs are rejected with `skip "PR #$PR_NUMBER does not come from a branch of this repo (fork) - never run."`.

All action steps (checkout, `claude-code-action`) are gated on `if: steps.gate.outputs.run == 'true'`.

### `review` job

Job-level condition (`claude.yml:106–110`):
```yaml
if: >-
  github.event_name == 'pull_request' &&
  github.event.pull_request.head.repo.full_name == github.repository &&
  github.event.pull_request.draft == false &&
  !startsWith(github.event.pull_request.head.ref, 'ai/')
```
Fork PRs evaluate to `false` and allocate no runner. Because the trigger is `pull_request` (not `pull_request_target`), GitHub Actions does **not** provision repository secrets to fork-originated runs — even if a runner were allocated by mistake.

**Result: AC3 PASS** — fork PRs cannot reach either job with the OAuth token.

---

## AC4 — What the `review` job gate actually checks (corrected)

**Previous overclaim (now corrected in docs/security/CI_WORKFLOW_SECURITY.md):** An earlier version of the evidence claimed the `review` job "checks writer access" at `claude.yml:128–129`. That is **incorrect**.

**Correct statement:** The `review` job "Gate (token present)" step (`claude.yml:123–129`) checks only `HAS_TOKEN` (whether `CLAUDE_CODE_OAUTH_TOKEN` is set in the repository secrets). It does **not** call the collaborator permissions API. The access control for the `review` job is the job-level `if:` filter above plus GitHub Actions' built-in secret isolation for `pull_request` events.

The `claude` (interactive) job alone queries `repos/$REPO/collaborators/$ACTOR/permission` and enforces `admin|maintain|write`.

Verified by test: *"review job gates on token presence (HAS_TOKEN) only — it does NOT check collaborator write permissions"*  
(`tests/unit/ci-workflows.test.ts`, describe block `workflow triggers, checkout refs, and fork isolation invariants (#298)`).

**Result: AC4 PASS (finding closed)** — the distinction is now documented and enforced by a test.

---

## AC5 — Timeout audit for all gate.yml jobs

| Job | `timeout-minutes` | File:line | Tier | Assessment |
|---|---|---|---|---|
| `changes` | 5 | `gate.yml:42` | fast + full | ✅ Compliant with 5-min rule |
| `checks` | 5 | `gate.yml:99` | fast + full | ✅ Compliant |
| `chromium` | 5 | `gate.yml:160` | fast + full | ⚠️ **P1 finding** (see below) |
| `firefox` | 40 | `gate.yml:194` | full only | ✅ Appropriate (full-tier browser install + all specs) |
| `webkit` | 40 | `gate.yml:227` | full only | ✅ Appropriate (full-tier browser install + all specs) |
| `gate` | 5 | `gate.yml:263` | fast + full | ✅ Combiner only, compliant |

### P1 finding: `chromium` 5-minute cap on full tier

PR #81 set `chromium` to `timeout-minutes: 5` unconditionally. On a `workflow_dispatch` with `tier=full` the chromium job installs dependencies AND runs every Playwright spec (not just `@critical/@cross-browser`). Five minutes may be insufficient for the full-tier run.

**Status:** This finding is documented here. Fixing the `chromium` timeout for the full tier requires a CI workflow change, which the owner note prohibits for AI implementers ("Never modify .github/workflows… unless the issue is explicitly about CI"). A follow-up CI issue should raise the `chromium` timeout to ≥30 min when `tier=full`, matching the pattern used by `firefox` and `webkit`.

Verified by tests:
- *"changes/checks/chromium/gate has timeout-minutes: 5"* (fast-tier test)
- *"firefox/webkit has timeout-minutes: 40 (full tier only)"*
- *"chromium has timeout-minutes: 5 (applies to both fast and full tiers; see P1 finding)"*

**Result: AC5 PASS (audit complete)** — all timeouts are now documented with file:line evidence. The chromium full-tier issue is recorded but requires a CI-workflow-scoped follow-up.

---

## Test Commands Run

```
pnpm vitest run tests/unit/ci-workflows.test.ts --maxWorkers=2
# 104 tests passed (0 failed)
```

---

## Summary

| AC | Result | Key evidence |
|---|---|---|
| AC1 | ✅ PASS | No `pull_request_target` in either workflow; triggers listed with file:line |
| AC2 | ✅ PASS | No untrusted PR head checkout in privileged context; `persist-credentials: false` |
| AC3 | ✅ PASS | Fork PRs blocked by collaborator check (claude job) and job-level if: (review job) + GitHub secret isolation |
| AC4 | ✅ PASS | Overclaim corrected: review job gates on HAS_TOKEN only; new test enforces the distinction |
| AC5 | ✅ PASS (P1 documented) | All 6 jobs have file:line timeout evidence; chromium 5-min-on-full-tier recorded for follow-up |

Supersedes part of #271.
