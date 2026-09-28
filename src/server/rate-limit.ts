import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { HttpError } from "./http";

/**
 * Limit on starting runs (and other costly actions), per key, as an exact SLIDING window stored in PostgreSQL (P4-13):
 * the limit is global across web instances, not per process. Keys are hashed (no user ids / key ids stored in clear).
 * Each check takes a per-key transaction-level advisory lock, drops hits older than the window, counts, then either
 * records the hit or refuses — so concurrent requests can't overshoot.
 */
export const RUNS_PER_MINUTE = 30;
const WINDOW_SECONDS = 60;

export async function checkRate(key: string, limit = RUNS_PER_MINUTE, windowSeconds = WINDOW_SECONDS, now = new Date()) {
  const { db } = await import("@/db");
  const hashed = createHash("sha256").update(key).digest("hex");
  const allowed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${hashed}, 0))`);
    const since = new Date(now.getTime() - windowSeconds * 1000);
    await tx.execute(sql`delete from rate_limit_hit where key = ${hashed} and at <= ${since}`);
    const { rows } = await tx.execute<{ n: number }>(sql`select count(*)::int as n from rate_limit_hit where key = ${hashed} and at > ${since}`);
    if (Number(rows[0]?.n ?? 0) >= limit) return false;
    await tx.execute(sql`insert into rate_limit_hit (key, at) values (${hashed}, ${now})`);
    return true;
  });
  return allowed;
}

export async function checkRunRate(key: string, now = new Date()) {
  if (!(await checkRate(`runs:${key}`, RUNS_PER_MINUTE, WINDOW_SECONDS, now))) {
    throw new HttpError(429, "RATE_LIMITED", `You can start at most ${RUNS_PER_MINUTE} runs per minute. Try again shortly.`);
  }
}
