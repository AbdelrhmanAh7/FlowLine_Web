/**
 * Private beta funnel report (P4-15) from product_event — counts only, no user content.
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/beta/report.mts [--days 14] [--json]
 */
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const days = Number(arg("days", "14"));
const since = new Date(Date.now() - days * 86_400_000);

const q = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];

const counts = await q<{ name: string; events: number; users: number; workspaces: number }>(sql`
  select name, count(*)::int as events, count(distinct user_id)::int as users, count(distinct workspace_id)::int as workspaces
  from product_event where at >= ${since} group by name order by name`);

// Funnel per user: signed up → onboarded → created a workflow → first successful run (via their workspaces).
const funnel = await q<{ signed_up: number; onboarded: number; created_workflow: number; first_success: number }>(sql`
  with u as (select distinct user_id from product_event where name = 'signup_completed' and at >= ${since}),
  ws as (select distinct user_id, workspace_id from product_event where name = 'workflow_created' and at >= ${since})
  select
    (select count(*) from u)::int as signed_up,
    (select count(distinct e.user_id) from product_event e join u on u.user_id = e.user_id where e.name = 'onboarding_completed')::int as onboarded,
    (select count(distinct ws.user_id) from ws join u on u.user_id = ws.user_id)::int as created_workflow,
    (select count(distinct ws.user_id) from ws join u on u.user_id = ws.user_id
       join product_event r on r.workspace_id = ws.workspace_id and r.name = 'run_finished' and r.props->>'status' = 'succeeded')::int as first_success`);

const runs = await q<{ status: string; n: number }>(sql`
  select props->>'status' as status, count(*)::int as n from product_event
  where name = 'run_finished' and at >= ${since} group by 1 order by 2 desc`);

const errors = await q<{ code: string; n: number }>(sql`
  select coalesce(props->>'code', 'unknown') as code, count(*)::int as n from product_event
  where name in ('api_error', 'run_finished') and (name = 'api_error' or props->>'status' = 'failed') and at >= ${since}
  group by 1 order by 2 desc limit 15`);

const copilot = await q<{ name: string; kind: string; outcome: string; n: number }>(sql`
  select name, coalesce(props->>'kind','') as kind, coalesce(props->>'decision', props->>'valid') as outcome, count(*)::int as n
  from product_event where name in ('copilot_requested','copilot_decided') and at >= ${since} group by 1,2,3 order by 1,2,3`);

const report = { since: since.toISOString(), days, counts, funnel: funnel[0], runs, topErrors: errors, copilot };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Flowline private beta — last ${days} days (since ${since.toISOString().slice(0, 10)})\n`);
  console.log("Funnel:", report.funnel);
  console.table(counts);
  console.log("Runs by status:"); console.table(runs);
  console.log("Top error codes:"); console.table(errors);
  console.log("Copilot:"); console.table(copilot);
}
await pool.end();
