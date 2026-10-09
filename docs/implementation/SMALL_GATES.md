# Small gates

`pnpm gate` (fast tier) and `pnpm gate:full` are unchanged. For focused work, `scripts/gate.mjs` also runs small named gates.
Call node directly: `node scripts/gate.mjs ...`. In Windows PowerShell write comma lists as one quoted string
(`--only="unit,contract"`); an unquoted comma is parsed as a PowerShell array and breaks the argument.

## Named gates (`--only`)

| Gate | Command |
| --- | --- |
| static (lint, typecheck, evidence) | `node scripts/gate.mjs --only=static` |
| unit / contract / integration / build | `node scripts/gate.mjs --only=unit` (likewise `contract`, `integration`, `build`) |
| browser group | `node scripts/gate.mjs --group=auth` |

Static checks already run in parallel with each other; integration is already sharded over its own databases (`--shards=N`).
Every run writes `summary.json` and logs under `artifacts/gates/`; a skipped, blocked or failed step shows in the table and
makes the exit code non-zero.

## Nightly tier

Slow or infra-sensitive suites run in the `nightly` vitest project (`pnpm test:nightly`, needs `.env.test`, Postgres and the
code-sandbox image) from `.github/workflows/nightly.yml` (cron 01:17 UTC, or Actions > Nightly > Run workflow on any ref). They
are excluded from the `unit` and `integration` projects, so the PR gate no longer runs them: `p2-code-sandbox`,
`company-builder-cli`, `sec-upgrade`, `sec-cxh06-rotation`, `sec-cxh01-backfill` and `drizzle-tooling-prune`. The list lives in
`nightlyFiles` in `vitest.config.mts`. The workflow creates `flowline_test` itself (the Postgres container starts with `flowline` only), like the Gate's integration legs. The nightly is not a required check. Run it by hand before merging a change to
`src/server/code-sandbox.ts`, `src/server/crypto|rewrap` or `drizzle/**`.

## Browser groups (`--group`)

`scripts/gate-groups.mjs` is the registry. Groups: `product`, `auth`, `editor`, `platform` (`--list-groups` prints them with
their specs). Every `e2e/*.spec.ts` must be in exactly one group. The gate refuses to start (exit 2) if a spec is unassigned,
listed twice, missing from disk, or if a name is unknown. `tests/unit/gate-groups.test.ts` checks this against the files on
disk, so adding a spec without assigning it fails `pnpm test`.

- `--group=auth,editor` selects those groups' concrete files; they are passed to Playwright as file arguments (not a grep), to
  native Playwright on Windows and to `e2e/tools/browser-docker.sh` on Linux alike. Chromium runs every test in those files;
  other projects also retain the project's configured critical/cross-browser filter.
- `--group` implies `--only=chromium`. Name more projects explicitly: `--only=chromium,firefox --group=auth`.
- `--group` narrows only the browser step. `--tier=full` without `--group` runs every file exactly as before.
- The summary table, `summary.json` (`group.groups`, `group.files`) and `progress.log` record the group and files.
- A group run starts at most as many stacks as it has spec files.

## Isolated stacks and parallelism

Each browser run needs its own test stacks (app port, fake-provider ports, database; `scripts/test-stack.cjs`), and the gate
stops all test stacks at start and end. Two `gate.mjs` invocations therefore must not run at the same time: the second's
stop would kill the first's stacks. Do not run groups in parallel from separate shells. For more speed use a single
invocation with `--stacks=K` (bounded, 1..6) and, only on hardware with enough CPUs (about 2 per browser container plus the
stack), `--browsers=parallel`. The default stays sequential below 8 CPUs.

## Build identity and screenshots

Stacks reuse a build only when `build` passed in the same run; otherwise `dev-test` builds itself (and several stacks refuse to
start without this run's build). No earlier `.next-test` is reused.
Browser runners write screenshots into isolated artifact directories. The gate never resets tracked screenshots,
including changes made while a run is active.

## Limitations

- The manifest tests, full browser suite and narrowed authentication group were executed. Run-specific results are recorded in `UX_VERIFICATION_20261001.md`; a prior run is not evidence for subsequent changes.
- Group membership is by topic and can be rebalanced in `scripts/gate-groups.mjs`; the unit test keeps coverage complete.
- Specs are matched as `e2e/<name>.spec.ts` substrings; the manifest check rejects names where one would select another.

## Linux WebKit on Windows

With the isolated test stack running, use `bash e2e/tools/webkit-docker.sh`. On Windows, use Git Bash rather than the Windows System32 WSL launcher when Node and pnpm are installed on Windows. For example, in PowerShell:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -l e2e/tools/webkit-docker.sh
```

The runner validates `.env.test`, mounts only explicit source/configuration paths read-only, installs the locked Linux dependencies in container scratch space, and forwards the test application, fake providers and test database. The owner `.env` is never mounted. Each run writes unique evidence under `test-results/webkit-linux-*`; both the container and host reject missing reports, failures, skips and flaky/interrupted tests. Native WebKit remains useful for fast checks, but does not replace this required Linux check.
