#!/usr/bin/env tsx
/**
 * Pilot metrics script — prints the 8 week-1 success criteria from the staging DB.
 * Usage: pnpm tsx scripts/pilot-metrics.ts --from 2026-10-16 --to 2026-10-23
 * Read-only: only SELECT queries, no secrets in output.
 */

import { sql, SQL } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

interface Args {
  from: Date;
  to: Date;
}

interface PilotMetrics {
  signups: number;
  medianHoursToVerified: number | null;
  onboardingAndWorkspaceDay1: number;
  publishedFlowWithin3Days: number;
  runSuccessRate: number | null;
  p95QueueToStartMs: number | null;
  webhookRuns: number;
  approvals: number;
  duplicateWebhookRuns: number;
  crossWorkspaceAccessDenials: number;
  arabicSwitchersShare: string; // "0% (not tracked)"
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let fromStr: string | undefined;
  let toStr: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from") fromStr = args[++i];
    if (args[i] === "--to") toStr = args[++i];
  }

  if (!fromStr || !toStr) {
    console.error("Usage: pilot-metrics.ts --from YYYY-MM-DD --to YYYY-MM-DD");
    process.exit(1);
  }

  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T23:59:59.999Z");

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    console.error("Invalid date format. Use YYYY-MM-DD.");
    process.exit(1);
  }

  return { from, to };
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
async function getSignupsAndMedianVerified(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
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

/** Query 2: Users who finished onboarding + created a workspace on day 1 */
async function getOnboardingAndWorkspaceDay1(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT us.user_id)::int AS count
    FROM ${schema.userSettings} us
    JOIN ${schema.workspace} w ON w.created_by = us.user_id
    WHERE us.onboarding_completed_at IS NOT NULL
      AND DATE(w.created_at) = DATE(us.onboarding_completed_at)
      AND ${dateRangeClause(sql`us.onboarding_completed_at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/** Query 3: Users who published >= 1 flow within 3 days of sign-up */
async function getPublishedFlowWithin3Days(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT f.published_by)::int AS count
    FROM ${schema.flow} f
    JOIN ${schema.user} u ON u.id = f.published_by
    WHERE f.published_version_id IS NOT NULL
      AND f.published_by IS NOT NULL
      AND f.updated_at <= u.created_at + INTERVAL '3 days'
      AND ${dateRangeClause(sql`u.created_at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/** Query 4: Run success rate and p95 queue-to-start */
async function getRunMetrics(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
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
async function getWebhookRuns(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
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

/** Query 5b: Approvals for workflow runs (not agent tool approvals) */
async function getApprovals(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM ${schema.approval} a
    JOIN ${schema.run} r ON r.id = a.run_id
    WHERE a.kind = 'approval'
      AND a.run_id IS NOT NULL
      AND ${dateRangeClause(sql`r.created_at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/**
 * Query 5c: Duplicate webhook runs — deliveries rejected as duplicates (same event id or
 * signature replay). Rejected events never have a run_id, so they are counted by
 * received_at; the detail filter excludes other rejection reasons (e.g. "flow not published").
 */
async function getDuplicateWebhookRuns(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM ${schema.webhookEvent} we
    WHERE we.status = 'rejected'
      AND we.detail = 'duplicate'
      AND ${dateRangeClause(sql`we.received_at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/** Query 6: Cross-workspace access denials (platform admin access denials as proxy) */
async function getCrossWorkspaceAccessDenials(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM ${schema.platformAuditEvent}
    WHERE action = 'admin.access_denied'
      AND ${dateRangeClause(sql`at`, from, to)}
  `);
  return result.rows[0] as { count: number };
}

/** Query 7: Share of users who switched to Arabic (not tracked in DB, cookie-only) */
function getArabicSwitchersShare(): string {
  return "0% (not tracked — locale is cookie-only)";
}

/** Run all queries and return structured metrics. */
export async function collectPilotMetrics(db: ReturnType<typeof drizzle>, from: Date, to: Date): Promise<PilotMetrics> {
  const [
    signups,
    onboardingWs,
    publishedFlow,
    runs,
    webhookRuns,
    approvals,
    duplicateRuns,
    accessDenials,
  ] = await Promise.all([
    getSignupsAndMedianVerified(db, from, to),
    getOnboardingAndWorkspaceDay1(db, from, to),
    getPublishedFlowWithin3Days(db, from, to),
    getRunMetrics(db, from, to),
    getWebhookRuns(db, from, to),
    getApprovals(db, from, to),
    getDuplicateWebhookRuns(db, from, to),
    getCrossWorkspaceAccessDenials(db, from, to),
  ]);

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
    crossWorkspaceAccessDenials: accessDenials.count,
    arabicSwitchersShare: getArabicSwitchersShare(),
  };
}

/** Format metrics as a Markdown table. */
export function formatMetricsAsMarkdown(metrics: PilotMetrics, from: Date, to: Date): string {
  const lines = [
    `# Pilot Metrics: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Sign-ups | ${metrics.signups} |`,
    `| Median time to verified | ${formatNumber(metrics.medianHoursToVerified)} hours |`,
    `| Onboarding completed + workspace created on day 1 | ${metrics.onboardingAndWorkspaceDay1} |`,
    `| Published ≥1 flow within 3 days | ${metrics.publishedFlowWithin3Days} |`,
    `| Run success rate | ${metrics.runSuccessRate ? (metrics.runSuccessRate * 100).toFixed(1) + "%" : "N/A"} |`,
    `| p95 queue-to-start | ${formatMs(metrics.p95QueueToStartMs)} |`,
    `| Webhook runs | ${metrics.webhookRuns} |`,
    `| Approvals (workflow) | ${metrics.approvals} |`,
    `| Duplicate webhook runs | ${metrics.duplicateWebhookRuns} |`,
    `| Cross-workspace access denials | ${metrics.crossWorkspaceAccessDenials} |`,
    `| Share of users who switched to Arabic | ${metrics.arabicSwitchersShare} |`,
  ];
  return lines.join("\n");
}

async function main() {
  const { from, to } = parseArgs();

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

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
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}