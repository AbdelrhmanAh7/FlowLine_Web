# Issue #85: questions for the owner (CI step 4)

Steps 1–3 and 5 are on this branch: the `e2e` / `@e2e-dev/web` devDependencies, `e2e.config.ts`, the `e2e-army/` suite
(sign-in and the core flow, ported from the hub's suite), `pnpm e2e:army` and the docs. Step 4, the GitHub Actions job,
is **not** in this PR, for two reasons. Please decide.

## 1. May an AI PR change `.github/workflows`?

The owner notes for AI engineers say: never modify `.github/workflows` or CI config unless the issue is explicitly about
CI, and CI changes always stop at the owner. Issue #85 is mostly about the test suite, with CI as one step. Should I add
the workflow below, or will you add it yourself?

## 2. The check name `e2e-army` would collide with the hub's status

The hub posts `e2e-army` as a commit status, and automerge requires it. A GitHub Actions job named `e2e-army` creates a
check run with the same name, and the hub cannot tell the two apart:

- `src/jobs/verify.ts` (about line 459) skips a head that already has an `e2e-army` entry:
  `ciChecks(...).some((c) => c.name === ARMY_CONTEXT)`. `ciChecks` returns both check runs and statuses, so the hub
  would never post its own verdict on that head.
- A GitHub runner has no model: no agy login, no Keychain, and no secret is allowed. So the agent tests skip
  (`E2E_ARMY_NOAGENT=1`) and only the landing and RTL tests run. A green Actions `e2e-army` check would therefore pass
  without the sign-in and core-flow tests running, and could stand in for the real gate.

Options:

- (a) Name the Actions job `e2e-army-ci`, a locator-only smoke check, and keep `e2e-army` for the hub. This is my
  recommendation.
- (b) Keep the name `e2e-army`, and change the hub so it reads only `source: "status"` for `ARMY_CONTEXT`.
- (c) Give the job a model through a repository secret, for example an OpenRouter key for an OpenAI-compatible model.
  `e2e.config.ts` would then need that provider and the `@ai-sdk/openai-compatible` package.

## 3. Five minutes is tight on a fresh runner

`pnpm install`, the Chromium download and the first `next dev` compile of `/`, `/sign-in` and onboarding all happen
before the first test runs. With `timeout-minutes: 5`, I expect the job to time out sometimes. Sharding does not help,
because the time goes into setup, not into the tests. Is `timeout-minutes: 8` for the whole job acceptable, with the
suite itself still capped at 5 minutes by `scripts/e2e-army.mjs`?

## Proposed workflow (option a), for you to add

```yaml
# .github/workflows/e2e-army.yml
name: e2e-army-ci
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
  e2e-army-ci:
    if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}
    runs-on: ubuntu-24.04
    timeout-minutes: 5
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
      - run: pnpm e2e:army
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: e2e-army
          path: |
            .e2e/report.json
            .e2e/artifacts
            .e2e/logs
          if-no-files-found: warn
          retention-days: 7
```

`pnpm e2e:army` starts the test stack itself, using `.env.test` from `setup-gate`. `e2e.config.ts` sets `retries: 0`
and a read-write replay cache, and those settings also apply in CI. `tests/unit/ci-workflows.test.ts` checks the
action pins.

## 4. Hub follow-up (not in this repo)

The hub runs its own FlowLine suite and this branch's `e2e-army/*.e2e.ts` in one `e2e run`, within its 270 s budget.
Until the hub drops the tests that are now in this repo, the sign-in and canvas steps run twice. Should
`ops/verify/e2e-army/tests/FlowLine_Web.e2e.ts` keep only its `fl-user` setup and leave the tests to the repo?
