<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — FlowLine (`AbdelrhmanAh7/FlowLine_Web`)

> **Single Source of Truth for All AI Coding Agents**  
> This file governs **Claude Code** (`CLAUDE.md`), **OpenAI Codex** (`AGENTS.md`), **GitHub Copilot** (`.github/copilot-instructions.md`), **OpenCode**, **CodeRabbit**, and **Thoth Labs** hub engineers.  
> **Current Stage:** Stage 1 — First Customer MVP (No Enterprise Bloat).

## 1. Product Goal (Stage 1: First Paying Customer)

**FlowLine** is a visual, AI-native workflow automation platform (inspired by [Gumloop](https://www.gumloop.com/)) built with **Next.js 16, React 19, Tailwind CSS 4, `@xyflow/react`, PostgreSQL, and a background worker queue**.

Our **only goal in Stage 1** is to let a non-technical user:
1. Sign in with email/password in under 60 seconds and land directly in a default workspace.
2. Pick a ready-made template (or connect 3 nodes on the visual canvas: **Input/Trigger → AI Step → Output Action**).
3. Click **Run**, execute against a real AI provider, and inspect the real output in under 3 minutes.

If a task, issue, or pull request does not directly serve this 3-step journey, **do not build it**.

## 2. What Already Exists in the Repository (Reuse, Do Not Rewrite)

Before creating any file or helper, inspect the existing implementation paths:

| Area | Feature ID | Existing Code Paths | Stage 1 Status |
| :--- | :--- | :--- | :--- |
| **Landing & Auth** | `fl-landing`, `fl-sign-in`, `fl-sign-up`, `fl-auth-api` | `src/app/page.tsx`, `src/app/(auth)/sign-in/**`, `src/app/(auth)/sign-up/**`, `src/app/api/auth/**`, `src/lib/auth.ts` | **ACTIVE (Keep simple)** |
| **Arabic / RTL & i18n** | `fl-i18n-rtl` | `src/i18n/**`, `src/components/language-switcher.tsx`, `src/app/layout.tsx` | **ACTIVE (Core differentiator)** |
| **Workspace Shell & Flows** | `fl-workspaces`, `fl-workspace-nav`, `fl-flows-list`, `fl-flows-api` | `src/app/w/[slug]/layout.tsx`, `src/app/w/[slug]/flows/**`, `src/app/api/flows/[fid]/route.ts`, `src/server/flows.ts` | **ACTIVE (Core MVP)** |
| **Visual Canvas Builder** | `fl-builder`, `fl-flow-validation`, `fl-flow-publish` | `src/components/builder/**`, `src/app/w/[slug]/flows/[flowId]/**`, `src/engine/nodes.ts`, `src/engine/validate.ts` | **ACTIVE (Core MVP)** |
| **Worker & Execution Engine** | `fl-run-execution`, `fl-engine-nodes`, `fl-csv-data-node`, `fl-files` | `worker/runner.ts`, `worker/handlers.ts`, `src/engine/execute.ts`, `src/app/api/workspaces/[wid]/files/**` | **ACTIVE (Core MVP)** |
| **AI Steps & Routing** | `fl-ai-nodes`, `fl-ai-providers` | `src/ai/hub/execute.ts`, `src/ai/hub/routing.ts`, `src/app/w/[slug]/settings/ai-providers.tsx` | **ACTIVE (Core MVP)** |
| **Webhooks & App Actions** | `fl-trigger-webhook`, `fl-integration-actions`, `fl-connections` | `src/app/api/hooks/**`, `src/integrations/providers/**`, `src/integrations/http.ts`, `src/server/connections.ts` | **ACTIVE (Core MVP)** |
| **Templates & Run History** | `fl-templates`, `fl-run-history` | `src/app/w/[slug]/templates/**`, `src/engine/templates.ts`, `src/app/w/[slug]/runs/**` | **ACTIVE (Core MVP)** |

## 3. Hard Freeze List (Enterprise Scope — Strictly Forbidden in Stage 1)

AI agents must **NEVER** open new issues, start branches, or expand scope in the following areas until Stage 1 has 10 active external users:

| Frozen Area | Feature IDs | Frozen Paths (Do Not Touch unless fixing a build-breaking import) |
| :--- | :--- | :--- |
| **Federated MFA & ZITADEL** | `fl-zitadel-federated-mfa` | `src/server/zitadel-*.ts`, `src/server/federated-*.ts`, `src/app/api/federation/**`, `src/app/api/identity/**` |
| **Enterprise OIDC / SSO** | `fl-sso` | `src/app/w/[slug]/settings/sso.tsx`, `src/app/api/sso/**`, `src/server/sso.ts`, `src/server/oidc.ts` |
| **Company Builder (Digital Team)** | `fl-company-builder` | `src/company-builder/**`, `src/components/company-builder/**`, `src/app/w/[slug]/company/**` |
| **Platform Admin & Rewrap** | `fl-platform-admin` | `src/app/admin/**`, `src/app/api/platform/**`, `src/server/platform-*.ts`, `src/server/rewrap.ts` |
| **Enterprise Audit Logs** | `fl-audit-log` | `src/app/w/[slug]/settings/audit-log.tsx`, `src/server/audit.ts`, `src/app/api/workspaces/[wid]/audit/**` |
| **Custom OAuth Apps & Scoped v1 API** | `fl-oauth-apps`, `fl-public-api-v1` | `src/app/w/[slug]/settings/oauth-apps.tsx`, `src/server/oauth-apps.ts`, `src/app/api/v1/**` |
| **Billing & Complex Entitlements** | `fl-billing-plan`, `fl-usage-limits` | `src/billing/**`, `src/app/billing/**`, `src/server/entitlements.ts`, `src/server/prices.ts` |
| **Experimental Copilot & Agents** | `fl-copilot`, `fl-agents`, `fl-knowledge` | `src/components/builder/copilot-panel.tsx`, `src/server/copilot*.ts`, `worker/agent-runner.ts`, `src/server/knowledge*.ts` |

## 4. Clear Execution Path (Ordered Milestones for All Agents)

Work strictly in this order. Finish **Milestone 1** completely before taking tasks from **Milestone 2**.

### Milestone 1: Frictionless First-Run Journey (`#195` & Core Auth/Workspace)
1. **Zero-Friction Sign-Up to Canvas:** Ensure a new user signing up via `/sign-up` or `/sign-in` automatically gets a default workspace created and lands on `/w/<slug>/flows` without getting stuck on beta gates, email outbox traps, or multi-step onboarding wizards.
2. **Clean CSV & Run Input (`#103` / `#287`):** Preserve deterministic column ordering in `data.csv` and `run.input` without breaking existing migrations.
3. **Green Main Branch (`#60`):** Keep `pnpm typecheck` and core API tests green on `main`.

### Milestone 2: 5 Bulletproof Core Nodes (Real Execution, Not Fakes)
Ensure these 5 node types execute reliably end-to-end through `worker/runner.ts` and `src/engine/execute.ts` with clear error messages in `fl-run-history`:
1. **Webhook / Manual Input Trigger** (`fl-trigger-webhook` & manual run input payload).
2. **File / CSV Reader Node** (`fl-files`, `fl-csv-data-node` — reading uploaded CSV/text/PDF content).
3. **AI Processing Node** (`fl-ai-nodes` via `src/ai/hub/execute.ts` — prompt + structured JSON/text extraction using a real configured LLM key).
4. **HTTP Request Node** (`fl-engine-nodes` — calling any external REST webhook/API safely).
5. **App Output Node** (`fl-integration-actions` — sending output to Google Sheets, Slack, or Telegram/Email).

### Milestone 3: 3 High-Value Starter Templates (`fl-templates`)
Every new workspace must show 3 working, one-click templates in **Arabic (RTL)** and **English (LTR)**:
1. **تصفية وتلخيص رسائل العملاء (Lead & Support Triage):** Webhook/Text Input → AI Classify & Summarize (Arabic/English) → Slack/Telegram/Webhook Notification.
2. **استخراج بيانات الفواتير والملفات (Document/CSV Extractor):** File/CSV Input → AI Structured Extraction → Clean CSV/Table Output.
3. **موجز التقارير اليومي (Daily Operations Brief):** HTTP/Data Input → AI Executive Summary → Email/Webhook Delivery.

### Milestone 4: Public Live Demo Readiness
1. Verify all 3 templates run cleanly in staging (`:3110` / `:8444`) with real AI provider keys instead of test fakes.
2. Keep RTL layout (`<html lang="ar" dir="rtl">`) clean on the Login, Flows List, Builder Canvas, Templates, and Run Inspector screens.

## 5. Rules of Engagement for AI Agents (Claude, Codex, Copilot, OpenCode)

1. **Small, Atomic Pull Requests:**
   - Maximum **300 lines changed** and **8 files touched** per PR.
   - If a task requires more than 300 lines, split it into smaller sequential PRs. Never open multi-thousand-line PRs.
2. **Finish Before Starting (Right-to-Left Priority):**
   - If there is an open PR in Stage 1 scope with merge conflicts or failing checks, **fix and merge that PR first** before picking up a new issue.
   - Close or park any PR that touches Frozen Enterprise paths (Section 3).
3. **Verification Before Commit:**
   - Run `pnpm typecheck` and run the specific test file covering your change (`node --test <file>` or project test runner).
   - Do not invent UI buttons or routes in E2E tests that do not exist in `src/app/**`.
4. **Security & Secrets:**
   - Never commit `.env` files, API keys, tokens, or real passwords into code, tests, or markdown docs.
   - Read all secrets exclusively from environment variables at runtime.
5. **Arabic / RTL Standards:**
   - Use logical Tailwind properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`) instead of physical `left`/`right` utilities.
   - Keep code identifiers, URLs, JSON keys, and numbers wrapped in `<bdi dir="ltr">` or `dir="ltr"`.


## 6. Implementation Playbook (ship any Stage 1 task on the first try)

### 6.1 Setup (once per worktree)
- `pnpm wt add <name>` (links `node_modules`) or `pnpm install --frozen-lockfile`.
- `pnpm db:up`, then `pnpm db:migrate` (dev) and `pnpm db:migrate:test` (tests use `flowline_test`, never the dev DB).
- Next.js 16 differs from your training data: read `node_modules/next/dist/docs/` before using a Next API.

### 6.2 Where code goes (extend the paths in section 2; never start a parallel copy)
| Change | Put it in |
| :--- | :--- |
| Page / UI | `src/app/w/[slug]/**` (server components; `'use client'` only where needed); shared controls in `src/components/**` |
| API endpoint | `src/app/api/**/route.ts`, logic in `src/server/*.ts`; every data access goes through `src/server/access.ts` (non-members get 404) |
| Node / execution | `src/engine/nodes.ts`, `validate.ts`, `execute.ts` (shared by web and worker); worker in `worker/runner.ts`, `worker/handlers.ts` |
| AI step | `src/ai/hub/execute.ts`, `src/ai/hub/routing.ts` |
| App action / webhook | `src/integrations/providers/**`, `src/integrations/http.ts`, `src/app/api/hooks/**` |
| Template | `src/engine/templates.ts`, `src/engine/templates/` |
| Schema | `src/db/**`, then `pnpm db:generate` and commit the drizzle migration |
| Text | `src/i18n/messages/ar.json` and `en.json` with identical keys; `useT()` in client components, `await getT()` in server components |

### 6.3 The loop
1. Restate the issue's happy path in one line (who does what and sees which result).
2. Find the nearest existing example (`grep -rn "<feature id or route>" src worker`) and copy its pattern.
3. Write the failing test first: unit `tests/unit/<area>.test.ts`, API/DB `tests/integration/`, user flow `e2e-army/<issue>-<flow>.e2e.ts` tagged `feat:<id>`.
4. Make the smallest change that passes. At most 300 lines and 8 files; otherwise split into sequential PRs that are each green.
5. Run `pnpm typecheck`, `pnpm lint` and `pnpm test <file>`, then only the related integration or e2e file.
6. Update the docs the change affects (`README.md`, `docs/<area>/`, `docs/DEVELOPER_GUIDE.md`): the `docs` check fails a code PR with no `.md` change.
7. Commit with hooks on. The PR body has `Closes #N`, a `## Security posture` section, how to test, and the e2e test name.

### 6.4 Definition of done
- The happy path works end to end, and CI `gate` + `docs` are green.
- P0/P1 review findings (security, data loss, broken main flow) are fixed. Every other finding gets a reply in its thread (fixed, declined with a reason, or moved to a follow-up) and the thread is resolved: the goal is working happy paths, not bug-free perfection.
- No secrets, no frozen paths (section 3), no fake success in the UI.

### 6.5 When stuck
- A red check: read the failed log first (`gh run view <id> --log-failed`) and merge `origin/main` before debugging, since main may already have the fix.
- Never weaken a test, timeout, assertion, lint rule or CI config to get green.
- If the task needs product judgment, write `NEEDS-HUMAN: <reason>` in the PR and stop.

> **Precedence (owner 2026-10-27):** this Stage 1 charter decides *what* to build. The Constitution and the project rules below still govern *how* work is done (reviews, checks, docs, honesty, owner-only actions); they are unchanged.

---

# Constitution (binding on every AI agent: Claude, Codex, agy/Gemini, OpenCode, Copilot, Kimi, Command Code, Ollama, subagents)

Owner decision 2026-10-03. These articles override convenience, quotas and deadlines. The project rules below apply them.

1. **Every exception needs a written reason.** Any deviation from these rules or the project rules (merging or folding a draft, merging without a reviewer's confirmation, waiving or skipping a check, dismissing a scanner/Dependabot alert, force-pushing, rewriting pushed history, resolving a thread without the reviewer's confirmation, deleting data or branches) is allowed only if the reason, the risk and how it was verified are recorded **before or at the moment of the action**, in the commit message **and** as a comment on the PR or issue. No recorded reason, no exception. A missed record is corrected publicly as soon as it is found.
2. **Review before merge, on every branch.** Every PR, including stacked PRs into another PR's branch, gets a CodeRabbit review; a thread is resolved only after CodeRabbit itself confirms the fix (or the owner overrides with a recorded reason). Never merge, fold, cherry-pick-and-close or fast-forward a base branch over a **draft** PR: mark it ready, let it be reviewed, then merge it explicitly, or close it with a recorded reason.
3. **Green checks.** Required checks (`gate`, `docs`) and CodeQL must pass; code PRs also pass the full tier once on the final candidate. Never delete or weaken an assertion, raise a timeout or add a retry to hide a failure.
4. **Honesty.** Report outcomes as they are, with evidence (run ids, SHAs, commands). When an earlier statement turns out wrong, correct it where it was made (PR, issue, ledger).
5. **Traceability.** Every task has an issue on the board; every PR links it; decisions and exceptions are recorded where the next agent will look (PR, issue, `docs/implementation/`).
6. **Docs are part of the change** (see "Docs (mandatory)" below).
7. **Owner-only actions stay owner-only:** production deploy, live payments, DNS, real invitations, spending above $0, personal logins/MFA/secrets. Agents prepare; the owner acts.

Details and the exception-record template: `docs/GITHUB_WORKFLOW.md`.

# Flowline — project rules (all agents)

- **Scope:** Phases 1–3 are delivered; Phase 4 (private beta) status is in `SCOPE_MATRIX.md` and `docs/implementation/PHASE4_BETA_REPORT.md`. New work needs its own prompt. **Production deployment, live payments and release-scope changes need explicit owner approval.** Unverified integrations must never be presented as production-verified.
- **GitHub tracking (owner 2026-10-03):** every task has an issue with a milestone, `type:`/`priority:` labels and area on the [FlowLine — Delivery](https://github.com/users/AbdelrhmanAh7/projects/21) board; every PR links its issue (`Closes #N`; `Refs #N` for an owner-tracking issue labelled `owner-only`/`needs-owner`, which only the owner closes), carries the same milestone and labels, and moves on the board (Todo → In progress → In review → Done/Blocked). CodeRabbit threads are resolved only after CodeRabbit confirms the fix; main merges need green `gate` + `docs` and all conversations resolved (ruleset). Details: `docs/GITHUB_WORKFLOW.md`.
- **Docs (mandatory, owner 2026-10-03):** every task, by every agent (Claude, Codex, agy, OpenCode, Copilot, Kimi…), updates the Markdown docs it affects in the same commit/PR, so docs always describe the current state: the area doc (`docs/<area>/`, `README.md`, `docs/DEVELOPER_GUIDE.md` for commands/setup), the active phase's progress/status ledger under `docs/implementation/`, `NEXT_ACTION.md` when stopping mid-task or when the next step changes, and `SCOPE_MATRIX.md`/`AGENTS.md` when scope or a rule changes. Fix or delete any statement the change makes wrong. A task is not done until its docs are. CI (`.github/workflows/docs.yml`, checked by `scripts/ci/docs-check.mjs`) fails a non-draft PR that changes code, tests, scripts, schema, CI, deploy or root configuration files without changing a `.md` outside `artifacts/`; root coverage includes `package.json`, `pnpm-lock.yaml`, `Dockerfile*`, `docker-compose*.yml`, `next.config.*`, `tsconfig*.json`, `drizzle.config.*`, `vitest.config.*`, `playwright.config.*` and `*.config.{ts,mjs,js,cjs}`. The `docs-not-needed` label waives it only with an unindented plain-text PR body line `Docs not needed because: <reason>` with a real reason on the same line (not blank, not the literal `<reason>` placeholder, a lone `<...>` token or the bare word `reason`); body edits rerun the check. A PR file list of 3000 entries or more (GitHub's cap, so it may have dropped code files) counts as code changed and so needs docs or a valid waiver. Delegation briefs must include this rule.
- **Design source:** `design-reference/` (slide renders + `DESIGN-REFERENCE.md`). Tokens live only in `src/app/globals.css` `@theme`. No generic dashboard styling, no hover lifts, and motion ≤300ms with `prefers-reduced-motion` honoured.
- **Arabic-first:** Arabic is the default language (RTL), English secondary. Every user-facing string goes through `src/i18n` (`useT`/`getT`), with identical keys in `messages/ar.json` (source of truth) and `messages/en.json`. Product-supplied content (templates, catalog text) is translated by stable id in the UI layer. Use logical CSS (`ms/me/start/end`); keep emails, URLs, code and credentials LTR. E2E runs in English (`EN_STATE`), and `e2e/arabic.spec.ts` covers Arabic/RTL.
- **Security posture (PR section):** every PR fills the `## Security posture` section of the PR template: whether it adds or upgrades dependencies, adds or reads secrets, or changes permissions/workflow tokens. Name settings and states only; never record secret values or what a secret-scanning or Dependabot alert contains. Repository security settings (secret scanning, push protection, Dependabot alerts, Copilot review) belong to the owner (article 7); their state is tracked in `docs/implementation/OWNER_ACTIONS.md` and none counts as enabled until the owner records evidence.
- **Private beta:** sign-up is invitation-only when `FLOWLINE_BETA_MODE=invite_only` (`src/server/beta.ts`, enforced in the better-auth hook for every sign-up path). Email verification is required; tests and release scripts verify users through the real endpoint (the test outbox, or the staging DB outbox). The DB email outbox is allowed only with `FLOWLINE_ENV=test|staging`. Billing is sandbox-only; live keys are refused without explicit owner approval.
- **Honesty in UI:** no fake success, metrics, pricing, connections, or model names. Anything not built must show its real state, or a disabled control with a reason (`Button disabledReason`).
- **Data:** flows, versions, runs and steps live in Postgres. Every server access goes through `src/server/access.ts` (non-members get 404). Schema changes need a drizzle migration (`pnpm db:generate`).
- **Engine:** `src/engine` is shared by web and worker. Connection rules exist once (`checkConnection`).
- **E2E gate (owner 2026-10-08):** the blocking E2E gate for AI PRs is the hub's `e2e-army` status (tester-army/e2e, natural language). Every PR, backend-only ones included, adds or updates an `e2e-army/*.e2e.ts` test tagged `feat:<id>` for each feature its changed files touch (the hub maps files to features with the `paths` globs of its feature map; a backend-only change runs the feature's api-level shard, never "n/a"); first commit preferred, waiver only with `E2E: not needed — <reason>` in the PR description. Files no feature claims run the smoke shard and are reported as "feature map gap": add the feature or path to the hub's feature map. A PR that changes a user flow puts that test in `e2e-army/<issue>-<flow>.e2e.ts` in its first commit (title `@issue-<N> <criterion>`; imports only `e2e`, `@e2e-dev/web` and node built-ins). The per-feature suite is `e2e-army/features/` (tags `feat:`/`shard:`/`lvl:`). Run it with `pnpm e2e:army` (or `--shard-id core-api`); details in `docs/DEVELOPER_GUIDE.md`. Playwright specs stay as plain tests.
- **Test-only code** (fault injection, relaxed rate limits) must stay behind `FLOWLINE_ENV=test`. Tests use `flowline_test` (or `flowline_test_<suffix>` for gate shards and isolated stacks) and port 3100 (or the stack ports from `scripts/test-stack.cjs`), never the dev DB.
- **Gates before commit (owner decision 2026-10-03, two tiers):** gates run on GitHub Actions in `.github/workflows/gate.yml`; a commit or PR is gated when its CI run passes. Main requires the `gate` (Gate combiner) and `docs` checks, so every non-draft PR event, push to main and dispatch reports a real `gate`: no `paths-ignore`; a `changes` job (`scripts/ci/changed-scope.mjs`) classifies the files, and a docs-only change (only `docs/`, `artifacts/`, `**/*.md`; `design-reference/` counts as code because tests read it; a PR file list of 3000 files or more, or a push comparison of 300 or more, may be truncated by GitHub and counts as code with a `::warning::`) skips the test jobs and passes `gate` as "docs-only change: test jobs skipped by design"; a failed `changes` fails `gate`. On drafts every job, `gate` included, is skipped (drafts cannot merge; leaving draft starts a real run). Gate has no `labeled` trigger (a skipped job counts as passing, so a no-op run could mask a real failure); labels never start CI, and `docs.yml` alone reruns on label and body edits. Fast tier (lint, typecheck, evidence secrets, unit, contract, integration sharded over its own test databases, and Chromium's `@critical`/`@cross-browser` specs on isolated test stacks) runs on PRs and pushes to main. Full tier (adds every Chromium spec, Firefox and WebKit) runs only from `workflow_dispatch` with `tier=full` (Actions → Gate → Run workflow, or `gh workflow run gate.yml --ref <branch> -f tier=full`; the `full-gate` label does nothing): run it once just before merging, on the final candidate; the owner verifies its pass. Jobs: `changes`, `checks`, `chromium`, plus `firefox` and `webkit` on the full tier only (GitHub-hosted runners only, no self-hosted labels, no secrets beyond `GITHUB_TOKEN`; every fast-tier job has `timeout-minutes: 5` per the owner's 5-minute rule, so `checks` is one matrix job whose legs run on separate runners: static·unit·contract plus integration shards 1/3, 2/3 and 3/3, each with its own PostgreSQL; a leg that nears 5 minutes is split further, never given a longer limit); shared setup in `.github/actions/setup-gate`; `gate` passes only when `changes` and every test job succeeded (docs-only: all skipped; skipped firefox/webkit also pass on the fast tier). Actions are pinned by commit SHA (Node 24 releases), runners to `ubuntu-24.04`. Locally run focused checks (`pnpm lint`, `pnpm typecheck`, `pnpm test`, or a single spec); run `pnpm gate` locally only when explicitly needed. Every CI leg reports on its own: it uploads artifact `flowline-gate-<leg>-<run id>-<attempt>` (`checks-static`, `checks-integration-1of3` to `3of3`, `chromium`, `firefox`, `webkit`) holding its `summary.json` and logs. The static leg's come from `pnpm gate`; each integration shard writes its own through `scripts/ci/integration-shard.mjs` (the vitest log, `progress.log`, and a failed `summary.json` even when the shard is killed or times out), and the `gate-report` action rejects a summary that names another shard, so one leg's report is never read as another's. Reports are written under `artifacts/gates/` (git-ignored; summarise a run in a Markdown report under `artifacts/<area>/` to keep it as evidence). Integration tests refuse to run while a test-stack worker is up on their database (`pnpm stop:test`). Never delete an assertion or change a baseline to hide a bug; skipped or flaky tests are failures.
- **Helper agents** (Kimi, Codex, OpenCode/Command Code on free models, local Ollama): at most 3 at once (prefer 1–2, the laptop is resource-limited). Helpers don't commit, and there is never more than one agent per browser session. Use Ollama local models one at a time (`qwen3-vl:8b`, `qwen2.5:7b`).
- **Worktrees:** agent lanes use `pnpm wt add <name>` (creates `.claude/worktrees/<name>`, git-ignored, with `node_modules` linked to the main install; `<name>` must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`, so no `/` or `\` and no nested or escaping path: use `--branch feat/x` for a slashed branch), never folders beside the repo. Remove with `pnpm wt rm <name|path>` as soon as the branch is pushed or merged; only registered lanes qualify; bare names (no `/` or `\`, not absolute) resolve only to `<root>/.claude/worktrees/<name>`, while external lanes require an explicit path (absolute or containing `/` or `\`, relative paths resolved from cwd). All path comparisons resolve and normalize separators, and ignore case only on Windows; main/locked/dirty/unpushed work is kept, and removal never forces or deletes the branch. `pnpm wt prune` clears stale registrations first; list/prune skip missing or locked lanes and report per-lane errors while continuing.
- **Keyboard:** shortcuts must not fire while typing (`isTypingTarget`). Ctrl stands in for ⌘ on Windows/Linux.
- **Evidence:** reviews and test reports are Markdown under `artifacts/<area>/`, tied to the tested SHA. Raw output (screenshots, traces, logs, JSON, one-off helper scripts) is never committed: attach it to the PR or keep it as a CI artifact (`.gitignore` only lets `artifacts/**/*.md` in; see `docs/slimdown-plan.md`). Older raw evidence lives at the tag `archive/pre-slimdown-2026-10-10`. No secrets or customer data in evidence.
