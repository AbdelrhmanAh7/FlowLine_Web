# Owner brief — first sellable release: invite-only paid pilot (2026-10-03, binding)

Prepare Flowline — repository: AbdelrhmanAh7/FlowLine_Web — for its first sellable web release: a limited, invite-only paid pilot. Keep it a general-purpose, Gumloop-like platform, not a single-use-case product.

Review the latest main branch, actual code, AGENTS.md, CLAUDE.md, NEXT_ACTION.md, and SCOPE_MATRIX.md. Distinguish between implemented, locally tested, and verified with real external services. Do not rebuild existing functionality or stop at a plan: implement the actionable gaps.

Priorities:
1. Verify the complete workflow journey: create, save, manual and automated execution, results, error handling, and safe retries without duplicate external actions.
2. Validate every integration and AI provider advertised for launch using real accounts. Test Arabic and English output quality, costs, limits, and provider failures. Mocks do not count as live verification.
3. Close gaps in registration, account recovery, tenant isolation, permissions, and credential protection. Resolve outstanding security and field-validation findings with fresh evidence.
4. Prepare a reproducible deployment, monitoring, alerts, and backups. Test actual restoration and rollback.
5. Prepare one subscription plan with clear usage limits and metering. Initially use customer-provided API keys and clearly disclose that provider charges are separate. Test checkout, renewal, cancellation, and payment failures in sandbox. Do not rely on individual Claude/Codex subscriptions without an officially supported, authorised integration.
6. Deliver five tested templates, simple onboarding, support instructions, draft policies for owner review, and an acceptance checklist for a 3–5-customer pilot.

Defer desktop, mobile, and unnecessary feature expansion. Work on a separate branch and preserve existing changes. Run heavy test suites sequentially to avoid memory pressure.

The spending cap remains $0 unless I explicitly approve otherwise. Do not deploy to production, activate live payments, change DNS, or send invitations without explicit approval. Enter credentials securely outside the conversation. Continue all unblocked work and record external dependencies as BLOCKED.

Finish with a concise report containing:
- Implemented changes and exact commit SHA.
- Tests performed and their evidence.
- Anything untested or blocked.
- Specific actions required from me.
- READY / NOT READY for the first paid pilot, with reasons.

Passing CI alone does not establish readiness to sell.

---

## Operating notes from the Claude coordinator (binding, from earlier owner rules)
- Also obey docs/implementation/CODEX_TAKEOVER_20261003.md (CodeRabbit 3 reviews/rolling hour shared budget; ≤150 reviewable files per PR, stacked if bigger; independent pre-push review by a different worker; reply + resolve every CodeRabbit thread and answer its last message; gates on GitHub CI, laptop runs only focused checks; never weaken tests; never read/print .env*).
- **Integrate the finished lane branches first**, each as its own small PR on top of current main, reviewed and gated:
  - codex/lighthouse-ci (bbf2c60);
  - codex/p3-polish (dd567a4);
  - codex/copilot-benchmark (a58c70f);
  - codex/next-integration (983bafb, HubSpot; check the "two listener-based test files omitted" note, and make sure no test is skipped);
  - codex/security-review (ee70336);
  - codex/sec-redaction-h4 (H4, M1–M3, M6, M8);
  - codex/sec-auth-h1-h3 (H1–H3, M7) when it finishes.
  - Remaining security findings M4, M5, M9, L1–L3 are in docs/security/SECURITY_REVIEW_20261003.md.
- **Real-account verification needs the owner** (logins, MFA, API keys entered in the Flowline UI or the provider dashboard by the owner): record each such step as BLOCKED with the exact page and action in docs/implementation/OWNER_ACTIONS.md. Never ask for secrets in text.
- **Work in rounds:** this run has a hard limit of ~1h50m. Before 1h40m, write/refresh docs/implementation/PAID_PILOT_STATUS.md (task ledger: done / in progress / BLOCKED / next, with SHAs and evidence links) so the next round resumes from it. If the ledger shows all priorities done or BLOCKED on the owner, write the final report into it (the format above) and say "FINAL".
- **Models:** lead gpt-6.1-sol high; routine workers gpt-6-luna medium/high; security, billing and money logic gpt-6.1-sol high; pre-push reviews gpt-6.1-sol high. Max 3 workers at once; separate worktrees; remove each worktree after its PR merges.

## AI tool roster (owner, 2026-10-03): use ALL of them, matched to the task
| Tool | How to call | Use for |
|---|---|---|
| **Codex** (biggest quota) | `codex exec -m gpt-6.1-sol|gpt-6-sol|gpt-6-luna -c model_reasoning_effort=…` | Lead, most implementation, pre-push reviews (sol high) |
| **Antigravity / Gemini** | `agy -p "<brief>" --model gemini-3.8-flash-high|-medium --mode accept-edits --dangerously-skip-permissions` | UI/i18n/docs lanes, second-opinion reviews (a different model family from the author) |
| **OpenCode, free models** | `opencode run -m <free model from \`opencode models\`> "<brief>"` | Cheap lanes: docs, copy, small tests, inventories |
| **Command Code, free models** | `command-code -p "<brief>" -m poolside/laguna-s-2.1-free -t --permission-mode auto-accept` | Same as OpenCode. It reported "insufficient credits" once on 2026-10-02; try it, and fall back silently if it fails again |
| **Claude Sonnet 5.5 / Haiku 4.5** | `claude -p --model sonnet` / `--model haiku` (non-interactive) | Mid-size implementation and reviews; Haiku for small mechanical tasks |
| **Claude Fable 5.1** | `claude -p --model fable` | **Critical thinking and big decisions only**: architecture or security calls, root causes nobody else finds, READY/NOT READY reasoning, disputed review findings |

Rules:
- **Max 3 workers at once** (laptop memory), each in its own worktree.
- **Reviewer ≠ author:** prefer a different model family for the review than the author's.
- **No paid API usage:** free models and existing subscriptions only. The $0 cap applies to provider/API spend.
- **Log** which tool/model did each task in PAID_PILOT_STATUS.md.

## Quota balancing (owner, 2026-10-03)
Spread the work so no single tool's quota is exhausted, and keep up to 3 lanes running in parallel at all times while work remains.
- **Default split of lanes by share of tasks:**

  | Tool | Share | Notes |
  |---|---|---|
  | Codex | ~40% | Prefer gpt-6-luna; sol only where needed |
  | Gemini (agy) | ~20% | |
  | OpenCode/Command Code free | ~20% | |
  | Claude Sonnet/Haiku | ~15% | |
  | Fable | ~5% | Decisions only |
- **Track usage** in PAID_PILOT_STATUS.md: per tool, tasks done and any "limit/quota/credits/rate" errors seen.
- **When a tool reports a limit:** stop using it for this round, move its queued tasks to the next tool in the same capability tier, and note when it may be retried. Never retry in a tight loop.
- **Effort discipline:**
  - routine work: low/medium effort models;
  - high effort only for security, money, data integrity and pre-push reviews of those;
  - keep prompts short;
  - point to files instead of pasting them.
- **CodeRabbit:** max 3 reviews per rolling hour (shared). Claude (the coordinator): only short check-ins between rounds.

## Laptop shutdown window (owner, 2026-10-03 04:16)
The laptop shuts down automatically about 6 hours from now. **Hard stop for all work: 2026-10-03 09:46 local time.**
- **Every round must leave nothing only on the laptop:**
  - commit and push its branches to GitHub (draft PRs are fine; still follow the push/review rules);
  - refresh PAID_PILOT_STATUS.md and push it with the work;
  - stop all local test stacks (`pnpm stop:test`).
- **After 2026-10-03 09:46:** start no new lanes. Use the remaining minutes only to push, write PAID_PILOT_STATUS.md, and the final report.
- **Quotas:** stay well inside every account's limits. Stop using a tool at its first limit or credit warning, and keep at least ~20% headroom on Codex, Gemini and Claude so the accounts still work tomorrow.

## Small parallel slices (owner, 2026-10-03)
Do not run 2 large tasks. **Split every priority into small slices** (≈20–40 min each, one clear outcome, a few files) and run many in parallel, each with the best-fit tool, model and effort.
- **Concurrency:**
  - up to **5 lightweight agent lanes** at once (the agents themselves use little memory);
  - but only **one heavy local job at a time** (pnpm install in a new worktree, a test stack, integration tests, a build, a browser);
  - queue heavy jobs, and prefer GitHub CI for heavy verification.
- **Slice examples:**
  - one template + its test;
  - one doc (support guide, a policy draft);
  - one security finding;
  - one billing scenario test (checkout / renewal / cancel / failed payment);
  - one runbook section;
  - one integration's live-check script.
- **Pick the model per slice:**

  | Slice | Model | Effort |
  |---|---|---|
  | docs, copy, inventories | OpenCode / Command Code free, or Haiku 4.5 | low |
  | UI, i18n | Gemini flash-medium/high, or gpt-6-luna | medium |
  | features, tests | gpt-6-luna or Sonnet 5.5 | medium |
  | security, billing, money, data integrity, migrations | gpt-6.1-sol or Sonnet 5.5 | high |
  | pre-push review of those | gpt-6.1-sol | high |
  | final decisions | Fable 5.1 | — |
- **Merge path:** each slice ends as a small commit on its own branch (worktree). The lead batches related slices into PRs of ≤150 reviewable files, keeping to the CodeRabbit budget.
