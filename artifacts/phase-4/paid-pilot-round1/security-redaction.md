# Security redaction candidate preparation

- Base: `9641ad1e684cad7b84bd2385751ea19b0a9d4060` (main).
- Source series: `ee70336`, `76f71f6`, `cda452d`, `0c4b254`, `71ca0ce`, `59b5e6f`, `b477af0`; applied with `cherry-pick --no-commit` on `codex/pilot-security-redact-round1`.
- Tested state: uncommitted staged source diff atop base; evidence added after checks. No new committed SHA is claimed.
- `pnpm exec vitest run --project unit --fileParallelism=false tests/unit/beta-mode-security.test.ts tests/unit/billing-webhook-retry.test.ts tests/unit/egress-redirect-security.test.ts tests/unit/redact-api-logging.test.ts tests/unit/redact.test.ts tests/unit/run-output-redaction.test.ts`: **6 files / 34 tests passed**, no skips (2026-10-03).
- `pnpm exec tsc --noEmit`: passed. `git diff --cached --check`: passed.
- Source closes H4/M1/M2/M3/M6/M8 with synthetic local evidence. Existing plaintext aggregate remediation remains a separate controlled operation; actual DB billing retry/provider behavior is not freshly certified here.
- Report is included to allow a standalone main candidate; once the report lane merges, retain its canonical report and apply only this lane's remediation annotations.
- No environment files, provider calls, browser suites, local gates, commits or pushes. Original worktree preserved.
- Model/tool: Codex security worker (inherited lead model).
