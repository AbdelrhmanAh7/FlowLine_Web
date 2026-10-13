# Questions for #142 (blocked: run 6)

Acceptance needs a recorded live run (`FIELD_RUN=run6-v2-<sha> PACKET=packet.v2.json`) of the field harness on an isolated test stack. Offline re-scoring of run 4 is already recorded in run5 RESULTS.md; it is not a run.

1. Who runs run 6 (owner or a machine that can start the stack) on head of PR #188? Commit its RESULTS.md as `run6-v2-<sha>/`.
2. Or re-scope #142 so it does not close on the scorer fix (`Refs #142`) and run 6 moves to a follow-up issue?

Until then PR #188 should not claim `Closes #142`. Docs say the gaps are unit-tested but not live-confirmed (BUGS.md VF-04, RESULTS.md, NEXT_ACTION.md).

## What blocks run 6 here (round 14, corrected)

Earlier rounds listed "no model access" as a blocker. That was wrong: `scripts/dev-test.mjs` deletes every real model variable and starts the fake AI provider (`e2e/fakes/ai-server.ts`, :4011), so the field run needs no model. The real blockers on this agent machine:

- No Docker and no running Postgres; `.env.test` is absent (git-ignored, never committed).
- Another Postgres already listens on :5433 (password-protected, not this lane's; left alone).
- Starting a throwaway Homebrew Postgres 16 in `$TMPDIR` fails inside the agent sandbox (`initdb`: `shmget ... Operation not permitted`), and running it outside the sandbox was refused by the permission classifier. Nothing was faked.

## Recipe for run 6 (owner or a machine with Docker)

1. `pnpm db:up` (Postgres 17 on :5433) or any Postgres 17 with a `flowline_test` owner role.
2. Create a disposable `.env.test` from `.github/ci/env.test.template` (fill `DATABASE_URL` and the three secrets as the template header says; `FLOWLINE_COMPANY_BUILDER=on` is already in it).
3. `FLOWLINE_TEST_DB=flowline_test_142 FLOWLINE_BETA_MODE=open pnpm dev:test`, wait for `http://localhost:3100/api/health?require=worker` = 200.
4. `FIELD_RUN=run6-v2-$(git rev-parse --short HEAD) PACKET=packet.v2.json FIELD_SERVICES=slash npx playwright test -c artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.config.ts`
5. Commit only `run6-v2-<sha>/RESULTS.md` (score, per-VP table, failed checks, packet sha256); attach `results.json` to the PR. `pnpm stop:test` afterwards.
