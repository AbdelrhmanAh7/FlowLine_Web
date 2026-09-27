// Dev helper: summarize worker heartbeats and run statuses in the DB from the given env file.
import pg from "pg";
process.loadEnvFile(process.argv[2] ?? ".env");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log((await c.query("select worker_id, started_at, last_seen_at from worker_heartbeat order by last_seen_at desc limit 5")).rows);
console.log((await c.query("select status, count(*)::int from run group by status")).rows);
console.log((await c.query("select id, status, attempts, locked_by, created_at from run where status in ('queued','running') order by created_at limit 5")).rows);
await c.end();
