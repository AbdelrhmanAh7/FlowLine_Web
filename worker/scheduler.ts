import { CronExpressionParser } from "cron-parser";
import { dueFires } from "@/engine/schedule-math";
import { and, eq, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { enqueueRunEx } from "@/server/runs";

/** A fire is "on time" if it's due within this window; older due fires were missed (worker down, etc.). */
export const ON_TIME_WINDOW_MS = 2 * 60_000;
export const MAX_CATCHUP = 10;
export { dueFires };

/**
 * One scheduler pass. Each due schedule is locked (SKIP LOCKED, so parallel workers
 * split the work) and every fire time is recorded in schedule_fire, whose unique
 * (schedule, fire_at) makes each fire enqueue at most one run — even if two workers
 * or a restart race. Missed fires follow the schedule's policy:
 *   skip     → only on-time fires run; missed ones are recorded as skipped
 *   run_once → at most one catch-up run (the latest missed fire)
 *   run_all  → every missed fire runs, up to MAX_CATCHUP (older ones skipped)
 * Paused flows record their fires as skipped_paused and never catch up later.
 */
export async function schedulerTick(db: Db, now = new Date()) {
  let fired = 0;
  const due = await db
    .select({ id: schema.schedule.id })
    .from(schema.schedule)
    .where(and(eq(schema.schedule.active, true), lte(schema.schedule.nextFireAt, now)));
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [s] = await tx.execute<{ id: string }>(sql`select id from schedule where id = ${id} and active and next_fire_at <= ${now} for update skip locked`).then((r) => r.rows);
      if (!s) return;
      const [sc] = await tx.select().from(schema.schedule).where(eq(schema.schedule.id, id));
      const [flow] = await tx.select().from(schema.flow).where(eq(schema.flow.id, sc!.flowId));
      const after = new Date((sc!.lastFireAt ?? sc!.createdAt).getTime());
      const fires = dueFires(sc!.cron, sc!.timezone, after, now);
      const onTime = fires.filter((f) => now.getTime() - f.getTime() <= ON_TIME_WINDOW_MS);
      const missed = fires.filter((f) => now.getTime() - f.getTime() > ON_TIME_WINDOW_MS);
      let toRun: Date[] = onTime;
      if (sc!.missedPolicy === "run_once" && missed.length && onTime.length === 0) toRun = [missed.at(-1)!];
      if (sc!.missedPolicy === "run_all") toRun = [...missed.slice(-MAX_CATCHUP), ...onTime];
      const runSet = new Set(toRun.map((d) => d.getTime()));
      const paused = !flow || flow.deletedAt || !flow.publishedVersionId || flow.pausedReason;

      for (const f of fires) {
        const status = paused ? "skipped_paused" : runSet.has(f.getTime()) ? "enqueued" : "skipped_missed";
        const ins = await tx
          .insert(schema.scheduleFire)
          .values({ scheduleId: id, fireAt: f, status })
          .onConflictDoNothing({ target: [schema.scheduleFire.scheduleId, schema.scheduleFire.fireAt] })
          .returning({ id: schema.scheduleFire.id });
        if (ins.length === 0 || status !== "enqueued") continue; // already handled by someone else
        try {
          const { run } = await enqueueRunEx(
            null,
            flow!.id,
            {
              triggerKind: "schedule",
              triggerRef: f.toISOString(),
              actingUserId: flow!.publishedBy ?? undefined,
              input: { fired_at: now.toISOString(), scheduled_for: f.toISOString(), timezone: sc!.timezone, catch_up: !onTime.some((o) => o.getTime() === f.getTime()) },
            },
            tx,
          );
          await tx.update(schema.scheduleFire).set({ runId: run.id }).where(eq(schema.scheduleFire.id, ins[0]!.id));
          fired++;
        } catch (e) {
          await tx.update(schema.scheduleFire).set({ status: `skipped_limit` }).where(eq(schema.scheduleFire.id, ins[0]!.id));
          console.warn("[scheduler] could not enqueue", (e as Error).message);
        }
      }
      const next = CronExpressionParser.parse(sc!.cron, { tz: sc!.timezone, currentDate: now }).next().toDate();
      await tx.update(schema.schedule).set({ lastFireAt: fires.at(-1) ?? now, nextFireAt: next, updatedAt: new Date() }).where(eq(schema.schedule.id, id));
    });
  }
  return fired;
}
