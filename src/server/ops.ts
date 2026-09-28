import { readFile, stat, statfs } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Operational status for monitoring the private beta (P4-11). Aggregates only — counts, ages, codes — never content.
 * Each check has a status: ok | warn | fail, and the overall status is the worst of them.
 */
export type CheckStatus = "ok" | "warn" | "fail";
export interface OpsCheck {
  status: CheckStatus;
  detail: string;
  value?: number | string | null;
}

const worst = (xs: CheckStatus[]): CheckStatus => (xs.includes("fail") ? "fail" : xs.includes("warn") ? "warn" : "ok");
const n = (v: unknown) => Number(v ?? 0);

async function one<T>(q: ReturnType<typeof sql>) {
  return (await db.execute(q)).rows[0] as T;
}

export async function opsStatus(opts: { dataDir?: string; backupDir?: string } = {}) {
  const checks: Record<string, OpsCheck> = {};

  const hb = await one<{ age: number | null }>(sql`select extract(epoch from now() - max(last_seen_at))::float as age from worker_heartbeat`);
  const hbAge = hb.age == null ? null : Math.round(n(hb.age));
  checks.worker = hbAge == null ? { status: "fail", detail: "no worker has ever reported" } : { status: hbAge > 60 ? "fail" : hbAge > 15 ? "warn" : "ok", detail: `last heartbeat ${hbAge}s ago`, value: hbAge };

  const q = await one<{ queued: number; oldest: number | null; running: number; waiting: number }>(sql`
    select count(*) filter (where status = 'queued')::int as queued,
           extract(epoch from now() - min(created_at) filter (where status = 'queued'))::float as oldest,
           count(*) filter (where status = 'running')::int as running,
           count(*) filter (where status = 'waiting_approval')::int as waiting
    from run where status in ('queued','running','waiting_approval')`);
  const oldest = q.oldest == null ? 0 : Math.round(n(q.oldest));
  checks.queue = { status: oldest > 600 ? "fail" : oldest > 120 ? "warn" : "ok", detail: `${n(q.queued)} queued (oldest ${oldest}s), ${n(q.running)} running, ${n(q.waiting)} waiting for approval`, value: n(q.queued) };

  const f = await one<{ failed: number; total: number }>(sql`
    select count(*) filter (where status = 'failed')::int as failed, count(*)::int as total
    from run where finished_at > now() - interval '1 hour'`);
  const rate = n(f.total) ? n(f.failed) / n(f.total) : 0;
  checks.runs = { status: n(f.total) >= 10 && rate > 0.5 ? "warn" : "ok", detail: `${n(f.failed)} of ${n(f.total)} runs failed in the last hour`, value: rate };

  const ai = await one<{ n: number }>(sql`
    select count(*)::int as n from run_step where finished_at > now() - interval '1 hour' and error is not null
      and left(error->>'code', 3) = 'AI_'`);
  checks.ai = { status: n(ai.n) >= 10 ? "warn" : "ok", detail: `${n(ai.n)} AI step failures in the last hour`, value: n(ai.n) };

  const provider = await one<{ n: number }>(sql`
    select count(*)::int as n from run_step where finished_at > now() - interval '1 hour' and error is not null
      and ((error->>'code') = 'CONNECTION_AUTH' or left(error->>'code', 9) = 'PROVIDER_')`);
  checks.integrations = { status: n(provider.n) >= 10 ? "warn" : "ok", detail: `${n(provider.n)} integration step failures in the last hour`, value: n(provider.n) };

  const apiErr = await one<{ n: number }>(sql`select count(*)::int as n from product_event where name = 'api_error' and at > now() - interval '15 minutes'`);
  checks.apiErrors = { status: n(apiErr.n) >= 20 ? "fail" : n(apiErr.n) >= 5 ? "warn" : "ok", detail: `${n(apiErr.n)} API 5xx errors in the last 15 minutes (see logs by request id)`, value: n(apiErr.n) };

  const bw = await one<{ failed: number; total: number }>(sql`
    select count(*) filter (where outcome = 'failed')::int as failed, count(*)::int as total
    from billing_event where received_at > now() - interval '24 hours'`);
  checks.billingWebhooks = { status: n(bw.failed) > 0 ? "warn" : "ok", detail: `${n(bw.failed)} of ${n(bw.total)} billing webhook events failed in 24 h`, value: n(bw.failed) };

  if (opts.dataDir) {
    try {
      const s = await statfs(opts.dataDir);
      const freePct = Math.round((Number(s.bavail) / Number(s.blocks)) * 100);
      checks.disk = { status: freePct < 5 ? "fail" : freePct < 15 ? "warn" : "ok", detail: `${freePct}% free on ${opts.dataDir}`, value: freePct };
    } catch {
      checks.disk = { status: "warn", detail: `can't read disk usage of ${opts.dataDir}` };
    }
  }
  if (opts.backupDir) {
    try {
      const ok = await stat(`${opts.backupDir}/LAST_OK`);
      const ageH = Math.round((Date.now() - ok.mtimeMs) / 3_600_000);
      const failedMarker = await stat(`${opts.backupDir}/LAST_FAILED`).catch(() => null);
      const lastFailedNewer = failedMarker && failedMarker.mtimeMs > ok.mtimeMs;
      checks.backups = { status: lastFailedNewer || ageH > 26 ? "fail" : "ok", detail: lastFailedNewer ? `last backup FAILED (${(await readFile(`${opts.backupDir}/LAST_FAILED`, "utf8")).trim()})` : `last good backup ${ageH} h ago`, value: ageH };
    } catch {
      checks.backups = { status: "fail", detail: "no successful backup recorded yet" };
    }
  }

  return { status: worst(Object.values(checks).map((c) => c.status)), at: new Date().toISOString(), revision: process.env.FLOWLINE_RELEASE_SHA ?? "dev", checks };
}
