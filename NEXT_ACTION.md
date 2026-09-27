# Next action

## Phase 2 — closed on revised scope

- **Original verdict (2026-09-27, preserved):** NOT PASS — BLOCKED. On `bee4390` every deterministic check passed, but 11 SaaS sandbox-live checks couldn't run without credentials.
- **Owner decision (2026-09-28):** those 11 checks are out of scope for the Phase 2 gate only. **Revised verdict: PASS — revised Phase 2 scope; 11 external live checks deferred.** Baseline re-verified: no code changed between `bee4390` and the decision commit.
- **Deferred checks stay BLOCKED — missing credentials.** They are release requirements R-01…R-11 in `SCOPE_MATRIX.md` → *Release acceptance* (credentials and verification steps listed there). Those integrations are implemented and contract-tested but **not** live-verified. Don't call the product Production Ready until they pass, unless the owner approves a release-scope change.
- **Not authorised:** production deployment and live payments.

## Phase 3 — authorised; needs the Phase 3 prompt

Phase 3 (agents / knowledge / copilot, collaboration, billing, release) is authorised. Phases 1 and 2 were each driven by a detailed pasted prompt (requirements, tests, exit gate). **No Phase 3 prompt has been provided in the working session yet.** Its planned rows (P3-01…P3-16) come only from the one-line objective in the Phase 1 prompt.

Carry-forward items (P3-14…P3-16): the viewer-approval UI journey (needs the P3-04 roles UI), the Docker port-proxy connectivity issue (CX2-01), and the hydration warning (CX2-R01).

## Waiting for the user

- **The Phase 3 prompt** (paste it), so Phase 3 is built against its actual requirements and exit gate.
- **Optional, any time:** sandbox credentials `FLOWLINE_LIVE_*` for R-01…R-11 (see `.env.example`), then `pnpm test:live`.

## Resume or verify locally

```bash
pnpm install --frozen-lockfile
pnpm db:up && pnpm db:migrate && pnpm db:migrate:test
pnpm dev                 # http://localhost:3000 (web + worker)
pnpm check               # lint + typecheck + unit + contract + integration
pnpm test:e2e            # test stack on :3100 with provider doubles on :4010/:4011
pnpm test:live           # real Ollama + Postgres; SaaS BLOCKED without FLOWLINE_LIVE_* credentials
pnpm stop:test           # if a leftover stack holds :3100
```
