#!/usr/bin/env tsx
/**
 * Pilot metrics script — prints the 8 week-1 success criteria from the staging DB.
 * Usage: node scripts/with-env.mjs .env tsx scripts/pilot-metrics.ts --from 2026-10-16 --to 2026-10-23
 * Read-only: only SELECT queries, no secrets in output.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql, SQL } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

/** The one drizzle method the queries use; a transaction qualifies too. */
export type Queryable = Pick<ReturnType<typeof drizzle>, "execute">;

interface Args {
  from: Date;
  to: Date;
}

export interface PilotMetrics {
  signups: number;
  medianHoursToVerified: number | null;
  onboardingAndWorkspaceDay1: number;
  publishedFlowWithin3Days: number;
  runSuccessRate: number | null;
  p95QueueToStartMs: number | null;
  webhookRuns: number;
  approvals: number;
  duplicateWebhookRuns: number;
}

const USAGE = "Usage: pilot-metrics.ts --from YYYY-MM-DD --to YYYY-MM-DD";

export class UsageError extends Error {}

/** Strict `YYYY-MM-DD`: rejects other shapes and dates JS would silently roll over (2026-02-30). */
function parseDay(value: string | undefined, flag: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new UsageError(`${flag} needs a date as YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new UsageError(`${flag} ${value} is not a real date.`);
  return date;
}

/** Parse `--from/--to` (inclusive UTC days). Pure: throws UsageError, never exits. */
export function parseRange(argv: string[]): Args {
  let fromStr: string | undefined;
  let toStr: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") fromStr = argv[++i];
    else if (argv[i] === "--to") toStr = argv[++i];
  }
  const from = parseDay(fromStr, "--from");
  const toDay = parseDay(toStr, "--to");
  if (from > toDay) throw new UsageError(`--from ${fromStr} is after --to ${toStr}.`);
  return { from, to: new Date(toDay.getTime() + 86_400_000 - 1) };
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "N/A";
  if (typeof n === "number" && !Number.isInteger(n)) return n.toFixed(2);
  return String(n);
}

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "N/A";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/** Build the WHERE clause for the date range. */
function dateRangeClause(column: SQL, from: Date, to: Date): SQL {
  return sql`${column} BETWEEN ${from} AND ${to}`;
}

/** Query 1: Sign-ups and median time to verified (per-user first consumed verify token) */
async function getSignupsAndMedianVerified(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT u.id)::int AS signups,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (et.first_consumed - u.created_at)) / 3600
      ) AS median_hours_to_verified
    FROM ${schema.user} u
    LEFT JOIN (
      SELECT user_id, MIN(consumed_at) AS first_consumed
      FROM ${schema.emailToken}
      WHERE purpose = 'verify'
        AND consumed_at IS NOT NULL
      GROUP BY user_id
    ) et ON et.user_id = u.id
    WHERE ${dateRangeClause(sql`u.created_at`, from, to)}
  `);
  return result.rows[0] as { signups: number; median_hours_to_verified: number | null };
}

/**
 * Query 2: users who finished onboarding (not skipped) and created a workspace on day 1.
 * Cohort = users who signed up in range; "day 1" = both events within 24h of sign-up.
 */
async function getOnboardingAndWorkspaceDay1(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT u.id)::int AS count
    FROM ${schema.user} u
    JOIN ${schema.userSettings} us ON us.user_id = u.id
    JOIN ${schema.workspace} w ON w.created_by = u.id
    WHERE ${dateRangeClause(sql`u.created_at`, from, to)}
      AND us.onboarding_completed_at IS NOT NULL
      AND us.onboarding_skipped = false
      AND us.onboarding_completed_at <= u.created_at + INTERVAL '1 day'
      AND w.created_at <= u.created_at + INTERVAL '1 day'
  `);
  return result.rows[0] as { count: number };
}

/**
 * Query 3: users who published >= 1 flow within 3 days of sign-up. Uses the immutable
 * publish snapshots (flow_version.reason = 'publish'), so later edits, republishing or
 * unpublishing cannot move or remove the user's first publication.
 */
async function getPublishedFlowWithin3Days(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT u.id)::int AS count
    FROM ${schema.user} u
    JOIN (
      SELECT created_by, MIN(created_at) AS first_publish
      FROM ${schema.flowVersion}
      WHERE reason = 'publish' AND created_by IS NOT NULL
      GROUP BY created_by
    ) fp ON fp.created_by = u.id
    WHERE ${dateRangeClause(sql`u.created_at`, from, to)}
      AND fp.first_publish <= u.created_at + INTERVAL '3 days'
  `);
  return result.rows[0] as { count: number };
}

/** Query 4: Run success rate and p95 queue-to-start */
async function getRunMetrics(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'succeeded')::float /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('succeeded', 'failed')), 0) AS success_rate,
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (started_at - created_at)) * 1000
      ) AS p95_queue_to_start_ms
    FROM ${schema.run}
    WHERE ${dateRangeClause(sql`created_at`, from, to)}
      AND started_at IS NOT NULL
  `);
  return result.rows[0] as { success_rate: number | null; p95_queue_to_start_ms: number | null };
}

/** Query 5a: Webhook runs (accepted webhook events that created a run) */
async function getWebhookRuns(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM ${schema.webhookEvent} we
    JOIN ${schema.run} r ON r.id = we.run_id
    WHERE we.status = 'accepted'
      AND we.run_id IS NOT NULL
      AND ${dateRangeClause(sql`r.created_at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/** Query 5b: workflow approval decisions (approved or rejected) made in range, by decided_at. Agent tool approvals and reviews are excluded. */
async function getApprovals(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM ${schema.approval} a
    WHERE a.kind = 'approval'
      AND a.run_id IS NOT NULL
      AND a.status IN ('approved', 'rejected')
      AND ${dateRangeClause(sql`a.decided_at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/**
 * Query 5c: duplicate webhook runs. The hook route never stores a rejected "duplicate" row
 * (same-event retries return the existing event; signature replays hit a unique constraint),
 * so duplicates are measured on runs: for webhook runs created in range, sum (count - 1)
 * per (flow, trigger_ref) group that has more than one run. The unique index run_trigger_unique
 * should make this 0 on a healthy database; a non-zero value means the dedupe guard failed.
 */
async function getDuplicateWebhookRuns(db: Queryable, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(n - 1), 0)::int AS count
    FROM (
      SELECT COUNT(*) AS n
      FROM ${schema.run}
      WHERE trigger_kind = 'webhook'
        AND trigger_ref IS NOT NULL
        AND ${dateRangeClause(sql`created_at`, from, to)}
      GROUP BY flow_id, trigger_ref
      HAVING COUNT(*) > 1
    ) dup
  `);
  return result.rows[0] as { count: number };
}

/** Run all queries and return structured metrics. */
export async function collectPilotMetrics(db: Queryable, from: Date, to: Date): Promise<PilotMetrics> {
  // Sequential: a transaction handed in by a test is a single connection.
  const signups = await getSignupsAndMedianVerified(db, from, to);
  const onboardingWs = await getOnboardingAndWorkspaceDay1(db, from, to);
  const publishedFlow = await getPublishedFlowWithin3Days(db, from, to);
  const runs = await getRunMetrics(db, from, to);
  const webhookRuns = await getWebhookRuns(db, from, to);
  const approvals = await getApprovals(db, from, to);
  const duplicateRuns = await getDuplicateWebhookRuns(db, from, to);

  return {
    signups: signups.signups,
    medianHoursToVerified: signups.median_hours_to_verified,
    onboardingAndWorkspaceDay1: onboardingWs.count,
    publishedFlowWithin3Days: publishedFlow.count,
    runSuccessRate: runs.success_rate,
    p95QueueToStartMs: runs.p95_queue_to_start_ms,
    webhookRuns: webhookRuns.count,
    approvals: approvals.count,
    duplicateWebhookRuns: duplicateRuns.count,
  };
}

// No table records these two, so the report says so rather than printing a misleading 0.
/** Workspace access checks answer 404 (src/server/access.ts) without an audit row; `admin.access_denied` is platform-admin probes only. */
export const NOT_LOGGED_DENIALS = "N/A (not logged: workspace 404s write no audit row)";
/** The UI language is a cookie (src/i18n), never stored per user. */
export const NOT_TRACKED_ARABIC = "N/A (not tracked, locale is cookie-only)";

/** Format metrics as a Markdown table. */
export function formatMetricsAsMarkdown(metrics: PilotMetrics, from: Date, to: Date): string {
  const lines = [
    `# Pilot Metrics: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Sign-ups | ${metrics.signups} |`,
    `| Median time to verified | ${metrics.medianHoursToVerified == null ? "N/A" : `${formatNumber(Number(metrics.medianHoursToVerified))} hours`} |`,
    `| Onboarding completed + workspace created on day 1 | ${metrics.onboardingAndWorkspaceDay1} |`,
    `| Published ≥1 flow within 3 days | ${metrics.publishedFlowWithin3Days} |`,
    `| Run success rate | ${metrics.runSuccessRate == null ? "N/A" : (Number(metrics.runSuccessRate) * 100).toFixed(1) + "%"} |`,
    `| p95 queue-to-start | ${formatMs(metrics.p95QueueToStartMs)} |`,
    `| Webhook runs | ${metrics.webhookRuns} |`,
    `| Approvals (workflow) | ${metrics.approvals} |`,
    `| Duplicate webhook runs | ${metrics.duplicateWebhookRuns} |`,
    `| Cross-workspace access denials | ${NOT_LOGGED_DENIALS} |`,
    `| Share of users who switched to Arabic | ${NOT_TRACKED_ARABIC} |`,
  ];
  return lines.join("\n");
}

/** True when this file is the entry point. Compares real paths: `import.meta.url` is percent-encoded and argv[1] may be relative. */
export function isMainModule(metaUrl: string, argv1: string | undefined): boolean {
  return Boolean(argv1) && fileURLToPath(metaUrl) === path.resolve(argv1!);
}

async function main() {
  let range: Args;
  try {
    range = parseRange(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n${USAGE}`);
    process.exit(2);
  }
  const { from, to } = range;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run through scripts/with-env.mjs (see docs/DEVELOPER_GUIDE.md).");

  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });

  try {
    const metrics = await collectPilotMetrics(db, from, to);
    console.log(formatMetricsAsMarkdown(metrics, from, to));
  } finally {
    await pool.end();
  }
}

// Only run main when executed directly (not imported as a module)
if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((err) => {
    // Message only: a driver error object can carry the connection string.
    console.error("Error:", err instanceof Error ? err.message : "unknown failure");
    process.exit(1);
  });
}