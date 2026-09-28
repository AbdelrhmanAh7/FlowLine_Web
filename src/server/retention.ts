import { sql } from "drizzle-orm";
import type { Db } from "@/db";

/**
 * Data retention (PRIVACY_AND_SAFETY.md §2). Deletes, in bounded batches:
 *   - finished workflow runs (with their steps, events and approvals — FK cascade) older than RUN_DAYS,
 *   - finished agent runs (with their steps) older than RUN_DAYS,
 *   - webhook deliveries older than WEBHOOK_DAYS, product telemetry older than TELEMETRY_DAYS,
 *     audit entries older than AUDIT_DAYS,
 *   - expired sessions, verification tokens, OAuth and SSO states.
 * Never touched: the usage ledger and billing records (billing history), workflows, versions, connections, knowledge.
 * Queued/running/waiting runs are never deleted, whatever their age.
 */
export const RETENTION_DEFAULTS = { RUN_DAYS: 90, WEBHOOK_DAYS: 30, TELEMETRY_DAYS: 180, AUDIT_DAYS: 365 };
const BATCH = 5_000;
const LOCK_KEY = 0x464c5254; // "FLRT" — one worker prunes at a time

function days(name: keyof typeof RETENTION_DEFAULTS) {
  const v = Number(process.env[`FLOWLINE_RETENTION_${name}`]);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : RETENTION_DEFAULTS[name];
}

export async function pruneOnce(db: Db, now = new Date()): Promise<Record<string, number> | null> {
  return db.transaction(async (tx) => {
    const [{ locked }] = (await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`)).rows as [{ locked: boolean }];
    if (!locked) return null;
    const before = (d: number) => new Date(now.getTime() - d * 86_400_000);
    const count = async (q: ReturnType<typeof sql>) => (await tx.execute(q)).rowCount ?? 0;
    const runDays = before(days("RUN_DAYS"));
    return {
      runs: await count(sql`delete from run where id in (select id from run where status in ('succeeded','failed','cancelled') and finished_at < ${runDays} limit ${BATCH})`),
      agentRuns: await count(sql`delete from agent_run where id in (select id from agent_run where status in ('succeeded','failed','cancelled') and finished_at < ${runDays} limit ${BATCH})`),
      webhookEvents: await count(sql`delete from webhook_event where id in (select id from webhook_event where received_at < ${before(days("WEBHOOK_DAYS"))} limit ${BATCH})`),
      telemetry: await count(sql`delete from product_event where id in (select id from product_event where at < ${before(days("TELEMETRY_DAYS"))} limit ${BATCH})`),
      audit: await count(sql`delete from audit_event where id in (select id from audit_event where at < ${before(days("AUDIT_DAYS"))} limit ${BATCH})`),
      sessions: await count(sql`delete from session where expires_at < ${now}`),
      verifications: await count(sql`delete from verification where expires_at < ${now}`),
      oauthStates: await count(sql`delete from oauth_state where expires_at < ${now}`),
      ssoStates: await count(sql`delete from sso_state where expires_at < ${now}`),
      emailTokens: await count(sql`delete from email_token where expires_at < ${before(1)}`),
      emailOutbox: await count(sql`delete from email_outbox where created_at < ${before(7)}`),
      emailRateWindows: await count(sql`delete from email_rate_limit where window_started_at < ${before(1)}`),
    };
  });
}
