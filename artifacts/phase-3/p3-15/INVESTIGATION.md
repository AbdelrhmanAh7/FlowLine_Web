# P3-15 — intermittent "database down" on the dev/test stack (carried CX2-01)

## Symptom (Phase 2, Codex)
During exploratory testing the test stack intermittently failed: sign-up returned 500, `/api/health` answered
`503 {"db":"down"}` for about three minutes, then recovered without any intervention.

## What was ruled out
- **PostgreSQL itself.** The container `flowline-db-1` was up for 14 hours with `RestartCount=0` and `OOMKilled=false`.
  Its log has no crash, recovery or shutdown after start. The only noise is 5 `password authentication failed`
  lines between 18:00 and 22:05 UTC from a client using wrong credentials (unrelated: a failed login can't cause a
  multi-minute outage).
- **Memory.** Postgres peaked at about 92 MB of its 512 MB limit under the Phase 3 load test.

## What was found
`netstat` shows **two different processes listening on port 5433** on this host:

| Listener | Process | Path to Postgres |
|---|---|---|
| `0.0.0.0:5433`, `[::]:5433` | `com.docker.backend.exe` (Docker Desktop) | direct port-forward into the container |
| `[::1]:5433` | `wslrelay.exe` (WSL localhost relay) | IPv6 loopback → WSL2 VM → Docker proxy → container |

Node resolves `localhost` to `::1` first (`[{"address":"::1"},{"address":"127.0.0.1"}]`), so the app's
`DATABASE_URL=…@localhost:5433` always took the **wslrelay** path. Both paths reach the same server (same
`inet_server_addr` and postmaster start time).

## Evidence: dual-path probe
`scripts/diag/db-path-probe.mjs` connects once per second over **both** host paths at the same moment, plus
`pg_isready` inside the container every 10 s. Raw data: `probe.jsonl`.

At the time of writing, after about 87 minutes and about 5,100 probes per path:

| Path | Failures | Nature |
|---|---|---|
| `::1:5433` (wslrelay) | **10** | connect timeout (3 s) while the other path answered in about 15 ms |
| `127.0.0.1:5433` (Docker backend) | **0** | — |
| inside the container (`docker exec pg_isready`) | **0** | — |

Failures cluster during heavy Docker activity. For example, 23:28–23:30 UTC was the pull and start of the 2 GB
Playwright image. See the final numbers in the release report.

## Classification
**Host networking, not the application or the database:** the WSL localhost relay on IPv6 loopback intermittently
fails to connect, especially under Docker load. The Phase 2 outage (minutes long) is consistent with a longer stall of
the same relay. It is probable rather than proven, because that exact multi-minute event was not captured again.

## Actions
1. **Avoid the flaky hop.** `.env.example`, `README.md` (and the local `.env` / `.env.test`) now use `127.0.0.1:5433`.
   The release image and staging never use host loopback (they reach the DB over the Docker network).
2. **Fail fast and recover (kept, not weakened).** The pool keeps `connectionTimeoutMillis: 5000`, keep-alive and
   `query_timeout`. The release-image outage test (`scripts/release/db-outage.mjs`) proves clean 5xx within seconds,
   no stack traces, and recovery without restarting web or worker, for both a stall (`docker pause`) and a stop/start.
   It also **found and fixed** a real defect: `/api/health` hung for more than 20 s during a stall. It now answers 503
   in 3 s (`72cff16`).
3. Health keeps reporting `db: down` honestly during an outage. Nothing was changed to make health look green.
