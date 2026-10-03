# Copilot benchmark lane evidence

Prepared on `paid-pilot-copilot` from main `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; source lane commit `a58c70f4a2a6ab2c180c6c417a09c171610e3a3b`.

- Patch applies without conflicts and touches 11 files, including two earlier fake-provider reports.
- `git diff --cached --check`: PASS.
- Existing reports state `openai/fake-gpt-mini`, a `$0` cap and an English-only fake run; the docs explicitly say this does not certify hosted-model quality.
- Source inspection confirms the reusable runner uses the workspace AI hub, checks a hard aggregate cap, rejects unknown-priced real calls, allows unknown pricing only for the local test double, and writes sanitized reports.
- `pnpm -s exec vitest run --project unit --maxWorkers=1 tests/unit/copilot-benchmark-score.test.ts`: PASS, 3 tests.
- DB integration checks were not run. The benchmark runner was not executed; no live provider calls were made.
- GitHub CI and PR publication: NOT RUN / NOT CREATED; lead reports $0/quota verification blocks external publication. This branch is ready for the lead's controlled commit.
- Intended change: reusable bounded runner, scoring helpers, tests, documentation and prior fake-provider report artifacts.
