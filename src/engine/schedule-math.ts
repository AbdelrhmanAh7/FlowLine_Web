import { CronExpressionParser } from "cron-parser";

/** Due fire times in (after, now], in order (DST handled by cron-parser in the schedule's zone). */
export function dueFires(cron: string, timezone: string, after: Date, now: Date, cap = 200): Date[] {
  const it = CronExpressionParser.parse(cron, { tz: timezone, currentDate: after, endDate: now });
  const out: Date[] = [];
  while (out.length < cap && it.hasNext()) out.push(it.next().toDate());
  return out;
}

export function nextFireAfter(cron: string, timezone: string, after: Date): Date {
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: after }).next().toDate();
}
