# Retained upload accounting

This document defines the accounting and locking contract for `file_object`. It
covers retained raw bytes, not physical database size, chunks, row overhead,
parser resources, queue capacity or a subscription entitlement. Full M5/scale
acceptance remains separate.

## Counters and admission

`retained_file_counter` has a primary-key scope of `installation` (null workspace
ID), or the workspace UUID. Each row holds nonnegative `bigint` `total_bytes` and
`file_count`. The scope constraint binds workspace counters to their workspace;
the workspace FK cascades away the counter when the workspace is deleted.
Workspace counters are created lazily and can remain at zero while the workspace
exists. The installation singleton is seeded by migration and must always exist.

`insertRetainedFile` reads only two indexed counter rows and inserts the file in
the caller's transaction. It uses `Buffer.length` for admission and derives the
file's size/hash. The trigger measures `octet_length(data)` independently of
caller-supplied size metadata. Limits default to 100 MiB per workspace and 512 MiB
per installation, with positive safe-integer byte overrides through
`FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES` and
`FLOWLINE_UPLOAD_INSTALLATION_MAX_BYTES`. All processes must use consistent
limits. Missing installation accounting or invalid configuration fails closed
with `UPLOAD_STORAGE_CONFIG`; cap failures keep the existing translated 413s.

The trigger maintains totals; application admission enforces configured caps.
Raw SQL that bypasses admission does not enforce those application limits.
Counters remove the per-upload full-table aggregate, but writes still serialize
on the installation accounting lock. No throughput measurement is claimed.
Account deletion holds that lock for its existing transaction, including provider
subscription cancellation; this can delay unrelated admissions.

## Mandatory lock order for every writer

**Before taking any workspace, source, file, or cascading-parent row lock, a
transaction that may mutate retained files must call
`lockRetainedFileAccounting(tx)`.** This includes inserts, data/workspace updates,
direct deletes, administrative cleanup and deletes of a parent workspace or user.
Ordinary access/authorization reads may precede it; a locking read, UPDATE,
DELETE or INSERT that takes an FK lock may not.

The shared helper takes, in order:

1. Transaction advisory lock
   `pg_advisory_xact_lock(hashtextextended('flowline:retained-upload-budget', 0))`.
2. The installation counter row `FOR UPDATE`.
3. Only then may the caller take workspace counters and domain/FK row locks.
   Multiple workspace rows must be locked in workspace-ID order.

All locks last until commit or rollback. Admission uses the helper before its
workspace-counter upsert and file INSERT. Source deletion uses it before the
source UPDATE or chunk/file DELETE. Account deletion uses it before even its
email-token lock, and before locking all member workspaces, including workspaces
that will survive the deletion.

An AFTER ROW trigger cannot repair an inverted caller order: the caller already
holds row/FK locks when it fires. Without this rule, deletion can hold workspace
W and wait on the installation counter while upload holds the installation
counter and waits on W's FK lock. The fix prevents this cycle; it does not rely
on retrying PostgreSQL deadlock errors. Future raw SQL/cleanup writers must use
the same advisory lock and installation-row lock before touching domain rows.
`TRUNCATE` is not an accounting API and is unsupported while accounting is live.

The retained advisory lock also coordinates admissions with the older scan-based
uploader. That alone does not make old destructive paths safe: do not run old
counter-based deletion code alongside this version. Drain those writers during
the rollout.

## Trigger coverage and destructive-path audit

Migration `0024_warm_loki.sql` installs an AFTER ROW trigger for INSERT, DELETE,
and UPDATE OF `data, workspace_id`. It updates the installation total first,
subtracts old workspace bytes/count, then adds the new workspace bytes/count.
A workspace cascade may already have removed its workspace counter; the trigger
does not recreate that row but always decrements installation usage. Exceptions
roll back the file mutation and counter changes together.

The following paths were audited with `rg` across `src`, `worker`, and `scripts`,
including SQL DELETE/TRUNCATE, ORM deletes, lock-taking reads, file references,
and schema foreign keys:

| Path | Retained-file effect and lock coverage |
| --- | --- |
| `knowledge.deleteSource`, called by the knowledge DELETE route | Soft-deletes source, deletes chunks and directly deletes its file. Takes accounting before the source UPDATE. |
| `email/flows.consumeAccountToken("delete")`, called by the account confirmation route | Takes accounting before token/workspace locks. Sole-member workspaces cascade-delete files; shared workspaces remain. The subsequent user DELETE nulls surviving files' `created_by`. |
| Workspace deletion | The only production workspace DELETE is the account path above. No independent workspace-delete endpoint/job was found. Future workspace deletion must take accounting first. |
| Direct file SQL DELETE/UPDATE | No other production writer was found. Triggers maintain accounting, but callers must still follow the lock rule. Serial raw-mutation fixtures test trigger accounting separately. |
| Flow soft-delete, and copilot's failed-flow physical DELETE | Files have no flow ownership FK and remain retained/accounted. Neither path reaches the accounting trigger. |
| Company Builder interview deletion | Cascades through profiles, blueprints, installations and installed-item records. `ref_id` is not a file ownership FK; existing knowledge/files remain. Installation cancellation likewise does not delete files. |
| Company Builder failed installation step | Transaction rollback undoes any file and trigger changes. The knowledge step reaches admission before domain writes; its installation-specific advisory lock is not acquired by destructive paths. |
| Membership removal/role change, connection/OAuth deletion, worker reindexing | Delete or change members, credentials, or chunks, not retained files. They do not acquire accounting later in the same transaction. |
| `server/retention.ts` and worker/script cleanup | Remove execution/history, telemetry, audit, authentication, rate-limit and heartbeat records. No retained-file or workspace cleanup was found. |
| Better Auth user deletion | Native `/delete-user` and callback routes are replaced by Flowline's account-token flow in `src/app/api/auth/[...all]/route.ts`. |

The three production insert sites (file-upload API, knowledge source creation,
and Company Builder knowledge fixtures) all use `insertRetainedFile`.

## Migration on a live database

The Drizzle-generated table, FK, journal and snapshot are extended with SQL
backfill and triggers. The existing migrator executes the migration statements
inside one transaction. Before reading existing files it takes
`SHARE ROW EXCLUSIVE` table locks on `workspace`, then `file_object`.

These locks wait for conflicting existing writers, then block new workspace/file
writes for the duration of the backfill and trigger installation. Ordinary reads
can continue. The one-time backfill calculates actual raw bytes and count for
every populated workspace and the installation, including zero-length files and
rows whose size metadata is wrong. It does not discard above-cap historical data.
The trigger becomes visible at the same commit that releases the table locks;
a waiting insert resumes with trigger accounting active. There is no unlocked
gap between backfill and trigger installation.

The migration therefore has an intentional write pause proportional to existing
rows. Schedule its application with that pause in mind, apply it before running
counter-aware application code, and drain destructive writers with the old lock
order. Migration execution and live upgrade timings have not been verified here.

## Rollback and recovery

- A failed upload, source deletion, account deletion or Company Builder step
  rolls back its database mutations and counter deltas; transaction locks release
  automatically. External subscription cancellation in the existing account flow
  is not undone by a database rollback.
- A migration/backfill/trigger-installation error rolls back the new table, data,
  trigger/function and migration journal entry together. Existing file rows remain
  intact; retry the unchanged migration after resolving the cause.
- After a committed migration, an application rollback must drain current writers
  first. Keep accounting schema/triggers while any counter-aware process exists;
  do not drop them online or reset totals to zero. Restoring the earlier
  scan-based application can retain the schema, but restoring the known inverted
  counter-based writer order is not an acceptable rollback.
- If counters drift, stop retained-file and parent-deletion writers and reconcile
  from `SUM(octet_length(data))` / `count(*)` under the same table locks in a reviewed
  repair transaction. Do not silently substitute zero or periodically overwrite
  live totals without excluding concurrent mutations.

## Verification status

`pilot-upload-admission.test.ts` covers caps, counter equality after mutations and
cascades, transactional rollback, and backfill correctness/failure recovery.
`retained-file-locking.test.ts` adds two real-connection production-path races:
account deletion versus admission, and source deletion versus account deletion.
It pauses after the destructive row lock, checks `pg_blocking_pids` and the
waiting SQL to prove the competitor waits at the accounting advisory lock, then
requires both operations to succeed and counters to equal actual SUM/count.

The migration concurrency test commits pre-migration fixtures first, pauses the
real SQL migration after backfill but before trigger installation, and observes
a second connection's INSERT blocked by the migrator. After trigger installation
and commit, that insert must commit and both totals must match actual data.
Removing the explicit file-table lock makes the competing insert complete before
the barrier and fails the test. No sleep duration is treated as proof of blocking.

These integration tests and migration execution are **NOT EXECUTED** in this
follow-up. Postgres and Docker must remain stopped under the owner's constraint.
No deployment, commit, scale acceptance or fresh CodeRabbit approval is implied.
