# DV2-02 persisted-ciphertext verifier

`scripts/security/dv2-02-verifier.ts` is a **one-shot local tool** — it is not part of the normal
test path and cannot run in CI without the named sibling checkouts and rotation record in place.
Its 55 unit tests (`tests/unit/dv2-02-verifier.test.ts`) use SQL doubles and do run in CI.

## What it proves

The verifier checks that every selected old-format connection ciphertext in the pre-rotation database
is rejected (raw AES-GCM authentication failure + app-level `decryptLegacyV1` / `decryptSecretV2`
rejection) by the replacement key. It also commits a synthetic fixture using the replacement key and
reads it back to prove the new connection-schema persistence path works end-to-end.

**DV2-02 is PARTIAL overall.** The primary reverse-direction ciphertext rejection and current
connection-schema persistence proof are completed. See
`artifacts/phase-4/takeover-20261003/security/DV2-02-STATUS.md` for the current status.

## Prerequisites

- Named sibling checkouts exist on disk; see `NAMED_FILES` in the script.
- The rotation record JSON is present at its expected path (configurable; see below).
- The named `.env.test` for the target contains a valid replacement key and loopback `DATABASE_URL`.
- Both databases (`--old-db`, `--new-db`) exist on loopback PostgreSQL.
- `FLOWLINE_ENV=test` is the only accepted value; no fallback keys may be set.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DV2_02_PARENT` | Parent of the worktree root | Directory that contains the named sibling checkouts (`FlowLine/`, `FL-wt-aihub/`, etc.). |
| `DV2_02_PRIMARY_ROOT` | `<PARENT>/FlowLine` | Absolute path to the primary checkout whose `.env` files are audited and whose rotation record is read. |
| `DV2_02_CANDIDATE_SHA` | Historical snapshot SHA | Git SHA whose `src/server/crypto.ts` the verifier checks against the working-tree copy. When unset or empty, the source-match check is skipped. |
| `DV2_02_ROTATION_RECORD` | `<PRIMARY>/artifacts/beta-execution/20260930T122429Z/key-rotation.json` | Absolute path to the key-rotation record JSON. Required by the full `--primary` / `--aihub` mode. |

## Usage

```sh
# Primary ciphertext rejection + persistence proof
node node_modules/tsx/dist/cli.mjs scripts/security/dv2-02-verifier.ts \
  --primary --old-db flowline_test --new-db flowline_test_beta20260930main

# Named-file audit only (no DB connection)
node node_modules/tsx/dist/cli.mjs scripts/security/dv2-02-verifier.ts \
  --audit-named-envs
```

Output is sanitised JSON on stdout. Any error writes a one-line `INCOMPLETE` message to stderr and
exits 1; raw keys, config values and driver errors are never printed.

## Running the unit tests (CI-safe)

```sh
nice -n 10 pnpm exec vitest run \
  --config scripts/security/vitest.security.config.mts \
  --maxWorkers=2
```

All 55 tests use in-memory SQL doubles; no database, no env files, no network.
