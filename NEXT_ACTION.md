# Next action

Phase 1 is complete: the gate passed on `d6894de` (see `artifacts/phase-1/REPORT.md`). Nothing is in progress.

## Resume or verify locally

```bash
pnpm install --frozen-lockfile
pnpm db:up && pnpm db:migrate && pnpm db:migrate:test
pnpm dev                 # http://localhost:3000 (web + worker)
pnpm check               # lint + typecheck + unit + integration
pnpm test:e2e            # starts the test stack on :3100
pnpm stop:test           # if a leftover stack holds :3100
```

## Waiting for the user

- Start Phase 2 (automation and integrations) with its own prompt. Candidate rows are P2-01…P2-13 in `SCOPE_MATRIX.md`.
- Optional: set `GOOGLE_*`/`GITHUB_*` in `.env` to enable OAuth (live verification is P3-13).
- Command Code helper: the account has no credits, even for its "free" models. Top it up only if you want it used.
