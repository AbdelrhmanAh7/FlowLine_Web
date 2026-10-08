# Restore, rollback and alerting runbook (DRAFT for owner review)

**Status: DRAFT, not executed, not production-verified.** It prepares the "approved deployment with restore, rollback
and alerts" owner item (PP-06 of the paid-pilot PP-02..PP-09 list, tracked in issue #30). The owner approves and
performs every real step; agents run none of it against a real environment. Nothing here changes the state of any
item in [OWNER_ACTIONS.md](../implementation/OWNER_ACTIONS.md).

- Placeholders only: `<beta-host>`, `<deploy-dir>`, `<dump-file>`, `<previous-sha>`, `<current-sha>`, `<key-store>`,
  `<alert-channel>`, `<owner>`. No credentials, hostnames or secrets belong in this file, in commands or in evidence.
- NileQuant stays PAPER only. This runbook has no broker, order or trading steps and does not apply to NileQuant.
- Billing stays sandbox-only; nothing here activates payments.
- It builds on the beta stack in [docker-compose.beta.yml](../../deploy/beta/docker-compose.beta.yml) and the
  [private beta runbook](../implementation/PRIVATE_BETA_RUNBOOK.md) (§4 monitoring, §5 backups, §6 rollback).

In the commands, `dc` stands for `docker compose -f docker-compose.beta.yml --env-file .env.beta`, run on
`<beta-host>` from `<deploy-dir>`. `<utc>` is the current UTC time as `YYYYMMDDTHHMMSSZ`.

How the paid-pilot owner items (issue #30) relate to this runbook (decisions are in §4):

- PP-06 (approved deployment with restore, rollback and alerts): this whole runbook.
- PP-02 (owner sign-in and admin MFA): the auth-failures alert and decision 3. PP-03, PP-04 (integrations, AI): the
  AI and integration step alerts. PP-05 (sandbox billing): the billing-webhook alert.
- PP-07 (policies and acceptance): decision 10. PP-08 (protected test configuration): decision 3.
- PP-09 (CI billing): not affected; this runbook adds no CI runs.

## 1. Backup and restore

### What is backed up

- **PostgreSQL (`db`, volume `beta-pg`)**: every table, so users, sessions, workspaces and members, flows and
  versions, runs and steps, connections (encrypted), agents, knowledge, API keys, billing state (sandbox), platform
  admin and settings, audit events. The `backup` service writes `pg_dump -Fc` nightly to
  `<deploy-dir>/backups/flowline-<utc>.dump`, keeps `BACKUP_RETENTION_DAYS` days (default 14) and writes the
  `LAST_OK` / `LAST_FAILED` markers the monitor reads.
- **Encryption keys and auth secret** (`FLOWLINE_ENCRYPTION_KEY`, `FLOWLINE_PLATFORM_ENCRYPTION_KEY`,
  `BETTER_AUTH_SECRET`): not in the dump. They live in `.env.beta` and must also be kept in `<key-store>`, separately
  from the dumps. A dump without the matching keys restores data whose stored credentials cannot be decrypted.
- **Not backed up today**: the Caddy certificate volumes (re-issued on start), container logs (rotated), and any
  off-host copy (the owner must choose one, see §4). A dump on the same disk as the database is not a real backup.

### Restore steps

Use these when data is lost or corrupted. Practise them first on an isolated copy, never on the pilot itself.

1. Get owner approval for the restore and note the incident start time and the reason in the incident record.
2. Pick `<dump-file>`: the newest `backups/flowline-<utc>.dump` taken before the damage (`ls -l backups/`). Record
   its timestamp: data written after it will be lost.
3. Record the running release: `dc images web` and `curl -fsS https://<beta-host>/api/health` (revision and
   `schemaVersion`).
4. Take a safety dump of the current state, even if damaged:
   `dc exec -T db pg_dump -U flowline -Fc flowline > backups/pre-restore-<utc>.dump`.
5. Post a maintenance notice in `<alert-channel>` and acknowledge the alerts the next steps will trigger.
6. Stop the writers: `dc stop web worker`. Leave `db` running.
7. Check the dump is readable: `dc exec -T db pg_restore --list < backups/<dump-file> > /dev/null`. Stop here if it
   fails and pick the previous dump.
8. Restore over the current database:
   `dc exec -T db pg_restore -U flowline -d flowline --clean --if-exists --no-owner < backups/<dump-file>`.
9. Confirm `.env.beta` holds the same encryption keys and auth secret as when the dump was taken (compare with
   `<key-store>`; never print the values).
10. Start the app with the same image: `FLOWLINE_IMAGE=flowline:<current-sha> dc up -d --wait`. The `migrate`
    service re-applies any expand-only migrations newer than the dump.
11. Run the verification queries below with `dc exec -T db psql -U flowline -d flowline`, and compare the counts with
    the last known figures.
12. Check `https://<beta-host>/api/health` returns 200 with `"db":"ok"`, `"worker":"ok"` and the expected revision.
13. Run the smoke suite from the operator machine with the pre-verified smoke accounts (`SMOKE_A_*` / `SMOKE_B_*`
    set privately): `node scripts/release/smoke.mjs --base https://<beta-host>`.
14. Sign in as `<owner>`, open one workspace, open one flow and its run history, and press **Test** on one
    connection (proves the keys decrypt stored credentials).
15. Post the all-clear in `<alert-channel>` and record the evidence (dump timestamp, counts, health, smoke result; no
    secrets or customer data) under `artifacts/phase-4/restore/`.

Verification queries (read-only):

```sql
-- Schema version: must equal schemaVersion from /api/health.
select count(*) as migrations from drizzle.__drizzle_migrations;
-- Core row counts: none may be zero unless it was zero before.
select 'user' as t, count(*) from "user"
union all select 'workspace', count(*) from workspace
union all select 'workspace_member', count(*) from workspace_member
union all select 'flow', count(*) from flow
union all select 'flow_version', count(*) from flow_version
union all select 'run', count(*) from run
union all select 'connection', count(*) from connection
union all select 'api_key', count(*) from api_key
union all select 'platform_admin', count(*) from platform_admin;
-- Newest run: must be just before the dump timestamp, never after it.
select max(created_at) as newest_run from run;
-- Runs cut off mid-flight by the backup show here; the worker resumes or fails them, check none stay stuck.
select status, count(*) from run group by status order by status;
-- Every membership points at a real user and workspace.
select count(*) as orphan_members from workspace_member m
  left join "user" u on u.id = m.user_id left join workspace w on w.id = m.workspace_id
  where u.id is null or w.id is null;
```

The automated drill [backup-restore.mjs](../../scripts/release/backup-restore.mjs) proves the same restore on the local
staging stack (row and id digests, sign-in, decryption, wrong-key refusal). Re-run it on the approved target before
calling the pilot infrastructure verified.

## 2. Rollback

Every release is an image tagged with its git SHA (`flowline:<sha>`). Migrations are expand-only, so the previous
image runs on the newer schema; there are no down migrations ([rollback.mjs](../../scripts/release/rollback.mjs)).

Criteria for choosing:

- **Roll back** when the new release causes an alert at fail level (5xx, health, sign-in, job failures) or a
  user-visible break, the previous image is known-good, and every migration since it is expand-only.
- **Roll forward** (ship a fixed image) when the fault is in data or a migration the previous image cannot read, when
  the release contains a security fix that rollback would remove, or when the fix is one small, tested change.
- **Restore (§1) instead** when data is lost or corrupted; rollback never repairs data.
- If none of these is clear within 15 minutes of the alert, roll back.

Steps:

1. Note the alert, the time and `<current-sha>` in the incident record; post in `<alert-channel>`.
2. Find `<previous-sha>`, the last release recorded as healthy under `artifacts/phase-4/release/`, and check its
   image is on the host: `docker image inspect flowline:<previous-sha> --format '{{.Id}}'`.
3. Check the migrations between the two releases are expand-only:
   `git diff --stat <previous-sha> <current-sha> -- drizzle/`, then read each new `.sql` file for `drop`, `rename`
   or type changes. If any is destructive, stop: choose roll forward or restore with the owner.
4. Take a safety dump: `dc exec -T db pg_dump -U flowline -Fc flowline > backups/pre-rollback-<utc>.dump`.
5. Deploy the previous image: `FLOWLINE_IMAGE=flowline:<previous-sha> dc up -d --wait`.
6. Check `https://<beta-host>/api/health`: revision is `<previous-sha>`, `schemaVersion` is unchanged (it never
   goes down), `"db":"ok"` and `"worker":"ok"`.
7. Run the smoke suite: `node scripts/release/smoke.mjs --base https://<beta-host>` (smoke accounts as in §1 step 13).
8. Watch the monitor in `<alert-channel>` for 30 minutes; every alert from step 1 must show RECOVERED.
9. Record the rollback (both SHAs, times, checks) under `artifacts/phase-4/rollback/`, and open an issue for the
   fix. The fix ships later as a normal release, never by editing the running stack.

## 3. Alerting

Today the `monitor` service ([monitor.mjs](../../scripts/ops/monitor.mjs)) polls `/api/health` and `/api/ops/status`
([ops.ts](../../src/server/ops.ts)) every 60 s, alerts to `FLOWLINE_ALERT_WEBHOOK_URL` after two failing polls in a
row, and announces recovery once. Thresholds below match the built checks unless marked "not built".

| Alert | Source | Suggested threshold | Built? | Owner |
|---|---|---|---|---|
| API error rate | `apiErrors`: API 5xx in the last 15 min | warn at 5, fail at 20 | yes | `<owner>` |
| Uptime | external probe of `https://<beta-host>/api/health` | 2 failed probes 1 min apart | not built (owner picks a probe) | `<owner>` |
| Auth failures | failed sign-ins and rate-limited auth requests | more than 20 in 15 min, or any 5xx on sign-in | not built (needs an ops check) | `<owner>` |
| Job failures: runs | `runs`: failed share in the last hour | warn above 50% with at least 10 runs | yes | `<owner>` |
| Job failures: queue | `queue`: age of the oldest queued run | warn at 120 s, fail at 600 s | yes | `<owner>` |
| Job failures: worker | `worker`: heartbeat age | warn at 15 s, fail at 60 s | yes | `<owner>` |
| Job failures: AI and integration steps | `ai`, `integrations`: step failures in the last hour | warn at 10 each | yes | `<owner>` |
| Backup age | `backups`: age of `LAST_OK`, or `LAST_FAILED` newer | fail above 26 h or on any failure | yes | `<owner>` |
| Off-host backup age | age of the newest off-host copy | fail above 26 h | not built (no off-host copy yet) | `<owner>` |
| Disk space | `disk`: free space on the data volume | warn below 15%, fail below 5% | yes | `<owner>` |
| Billing webhooks (sandbox) | `billingWebhooks`: failed events in 24 h | warn at 1 | yes | `<owner>` |
| Monitor blind | `ops`: `/api/ops/status` unusable | 2 failed polls | yes | `<owner>` |

For every alert the owner on duty:

1. Acknowledges it in `<alert-channel>` within the agreed response time (see §4).
2. Opens the detail: `dc logs --since 30m web worker`, and `/api/ops/status` on the internal network as in the
   private beta runbook §4. Ask users for the `x-request-id` of failing requests.
3. Decides: wait for recovery, roll back (§2), restore (§1), or follow the incident checklist in
   [PRIVACY_AND_SAFETY.md](../implementation/PRIVACY_AND_SAFETY.md) §7.
4. Posts the outcome and closes the alert once the monitor reports RECOVERED.

## 4. Owner decisions needed

This draft cannot settle these. Each has a default that applies until the owner decides; no default authorizes a
deployment, a spend or a change to a real environment.

1. Target host and domain (`<beta-host>`), and who may run `dc` on it (OWNER_ACTIONS O04, O08). Default: no target; nothing is deployed and this runbook stays a draft.
2. Off-host backup destination, its encryption, retention and readers. Default: none configured; the backup-age alert covers on-host dumps only and the pilot is not called restore-ready.
3. Where `<key-store>` lives, who holds the keys and how they are recovered without that person. Default: the owner's private password manager, owner only.
4. Recovery targets. Default: up to 24 h of data loss (nightly dumps) and 2 h to restore.
5. The channel behind `FLOWLINE_ALERT_WEBHOOK_URL`, the `<owner>` per alert, response times and hours. Default: one owner-only channel, the owner for every alert, best-effort response in working hours.
6. Whether to build the missing alerts (uptime probe, auth failures, off-host backup age) before the pilot. Default: open one issue per missing alert; the pilot waits for none of them.
7. The thresholds in §3. Default: the suggested values, reviewed after the first two pilot weeks.
8. Who may start a rollback or a restore without the owner present. Default: nobody; only the owner starts either.
9. The isolated environment and schedule for restore drills. Default: monthly, on the local staging stack, until a target copy exists.
10. What pilot customers are told during a restore and about data lost after the dump time. Default: the owner writes each notice; nothing is sent automatically.
