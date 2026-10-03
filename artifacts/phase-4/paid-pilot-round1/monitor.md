# Operational monitor — focused local proof

Base: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. Candidate branch: `codex/paid-pilot-monitor-20261003`. Source tested before adding this evidence; lead will record the committed SHA in the round ledger.

`pnpm exec vitest run --project unit --fileParallelism=false tests/unit/monitor.test.ts`: 17 tests passed, no skips. Targeted ESLint and `pnpm exec tsc --noEmit --incremental false` passed. `node --check` passed for both monitor modules. Tests use injected fetch doubles only.

Health now validates database and worker payloads. Operational results reject malformed, incomplete or unexpected checks; disappeared checks stay failing. Sustained warnings/failures notify once per severity after successful delivery, retry failed deliveries, and retry failed recovery notifications. HTTP/transport failures from the alert receiver are visible; redirects are refused. Raw operational details and nonnumeric values never reach alert text, logs or probe output. An absent operations token explicitly reports health-only coverage. One-shot mode fails its process status when a probe fails.

Independent source review: routine worker inspected earlier 16-case source and requested an explicit missing-token regression; security worker (gpt-6.1-sol high) inspected final 17-case source with no actionable blocker. Exact final staged-diff approval is recorded separately before the lead commits.

No live endpoints, alert receivers, credentials, provider accounts, deployment or full CI gate were exercised. External alert delivery and approved-infrastructure monitoring remain BLOCKED on owner setup. Tool/model: lead Codex; independent reviewers Codex routine and security workers.