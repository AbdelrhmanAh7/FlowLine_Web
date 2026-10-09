# Issue #85: questions for the owner (CI step 4)

On this branch: the `e2e` / `@e2e-dev/web` devDependencies, `e2e.config.ts`, the `e2e-army/` suite (the #85 sign-in and
core-flow tests at the top level, and the hub's per-feature suite in `e2e-army/features/`: 115 tests, tags
`feat:`/`shard:`/`lvl:`, every feature of the feature map covered), `pnpm e2e:army` (quick default, or
`pnpm e2e:army --shard-id core-api` for one shard) and the docs. Step 4, the GitHub Actions job, is **not** in this PR:
the owner notes forbid AI PRs from changing `.github/workflows` and say CI changes stop at the owner. Please decide
questions 1 to 3.

## 1. May an AI PR change `.github/workflows`?

Issue #85 is mostly about the test suite, with CI as one step. Should I add the workflow below, or will you add it?

## 2. Name of the check: `e2e-army`

The issue requires a check named `e2e-army`. The hub also posts `e2e-army` as a commit status, and automerge requires it.
`src/jobs/verify.ts` (about line 459) skips a head that already has an `e2e-army` entry
(`ciChecks(...).some((c) => c.name === ARMY_CONTEXT)`), and `ciChecks` returns check runs and statuses alike. If the
Actions job reports `e2e-army`, the hub would never post its own verdict. Options:

- (a) Keep the name `e2e-army` for the Actions aggregate job below, and change the hub so it reads only
  `source: "status"` for `ARMY_CONTEXT`. This meets the issue as written; it needs a hub change. **Recommended.**
- (b) Name the aggregate job `e2e-army-ci` and keep `e2e-army` for the hub. No hub change, but the check name deviates
  from the issue, so the acceptance would have to be waived.

A GitHub runner has no model (no agy login, no Keychain, no secret allowed), so there the agent (`ui`) tests skip
(`E2E_ARMY_NOAGENT=1`); the `api`/`job` tests and the locator checks run. The Actions check therefore covers the whole
backend and the non-agent UI checks; the agent steps stay with the hub's verify job.
Option (c): give the job a model through a repository secret (an OpenRouter key and `@ai-sdk/openai-compatible`).

## 3. Runtime: five minutes per job

The feature-map requirement is to shard by feature group, each job ≤ 5 min. The workflow below is a matrix over the
shards, one job per shard, `timeout-minutes: 5` each (and `scripts/e2e-army.mjs` stops its own run after 5 min). Install,
the Chromium download and the first `next dev` compile happen inside that budget; if the setup alone takes too long on a
fresh runner, `timeout-minutes: 8` for the job (the suite itself stays capped at 5 min) is the fix. I could not time the
shards here: the hub machine has no `.env.test` database for this repo, and the owner's rule is to run the full suites
on GitHub-hosted CI, not locally. `e2e list` selects all 115 tests and every feature id in the feature map has one.

## Proposed workflow (option a), for you to add

```yaml
# .github/workflows/e2e-army.yml
name: e2e-army
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: e2e-army-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  shard:
    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}
    name: e2e-army-shard (${{ matrix.shard }})
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    strategy:
      fail-fast: false
      matrix:
        shard: [smoke, core-api, flows-api, runs, triggers, schedule, ai-api, platform-api, ui-auth, ui-auth2, ui-flows, ui-builder, ui-settings, ui-ai, ui-admin, ui-misc]
    env:
      E2E_TELEMETRY_DISABLED: "1"
      DO_NOT_TRACK: "1"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ./.github/actions/setup-gate
        with:
          postgres: "true"
          browsers: chromium
      - run: pnpm e2e:army --shard-id "${{ matrix.shard }}"
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: e2e-army-${{ matrix.shard }}
          path: |
            .e2e/report.json
            .e2e/artifacts
            .e2e/logs
          if-no-files-found: warn
          retention-days: 7
  # The single check named `e2e-army`: green only when every shard is green.
  e2e-army:
    if: ${{ always() && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) }}
    needs: shard
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - run: test "${{ needs.shard.result }}" = "success"
```

Notes: the `shard` ids come from the `shard:` tags in `e2e-army/features/`; `tests/unit/e2e-army-tooling.test.ts` checks
that each test has them. `pnpm e2e:army` starts the test stack itself with `.env.test` from `setup-gate`;
`e2e.config.ts` sets `retries: 0` and a read-write replay cache. `tests/unit/ci-workflows.test.ts` checks the action pins
and may need the new file added to its list.

## 4. Hub follow-up (not in this repo)

The hub runs its own FlowLine suite and this branch's top-level `e2e-army/*.e2e.ts` in one `e2e run`, within its 270 s
budget. Until the hub drops the tests that are now in this repo, the sign-in and canvas steps run twice. Should
`ops/verify/e2e-army/tests/FlowLine_Web.e2e.ts` keep only its `fl-user` setup and leave the tests to the repo?

## 5. Review resolution: CodeQL clear-text logging in scripts/e2e-army.mjs

CodeQL flagged the log line of `scripts/e2e-army.mjs` for clear-text logging of sensitive data from `process.env`.
Resolved by logging constant descriptors only (`custom URL` / `test stack on :3100`, and `claude` / `agy` / `none (agent
tests skip)`), so no environment value reaches `console.log`.

## 6. Layout note

The per-feature suite lives in `e2e-army/features/` with its helpers (`_helpers.ts`, `../lib.ts`). The hub copies only
top-level `e2e-army/*.e2e.ts` (max 8) and a copied file may import only `e2e` / `@e2e-dev/web`, so the shared helpers
cannot sit next to the top-level files. The hub keeps running its own copy of these tests per shard; the in-repo copy is
for `pnpm e2e:army --shard-id core-api` and the CI matrix above.
