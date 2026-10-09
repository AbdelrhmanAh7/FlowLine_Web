// SCHEDULE shard (job, no model): the worker's scheduler fires a published schedule trigger. The cron minute is derived from the SERVER's clock so the
// first fire is at most about a minute away (the product itself only forbids schedules whose fires are less than 5 minutes apart).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { seeded } from "../lib.ts";
import { E, N, actor, newFlow, serverNow, waitRun, type Graph } from "./_helpers.ts";

/** "M * * * *" with M = the next whole minute that is at least ~25 s away on the server clock. */
async function nextMinuteCron() {
  const now = await serverNow();
  const minute = (now.getUTCMinutes() + (now.getUTCSeconds() <= 30 ? 1 : 2)) % 60;
  return { cron: `${minute} * * * *`, minute };
}
const graph = (cron: string, tz = "UTC"): Graph => ({
  nodes: [N.schedule(cron, "t", "Timer", tz), N.transform("shape", '{ "tz": timezone, "catchUp": catch_up, "scheduled": scheduled_for }'), N.output("out", "result")],
  edges: [E("t", "shape"), E("shape", "out")],
});

test("[fl-trigger-schedule.1] publishing a schedule reports its next fire time, rejects bad schedules, and unpublishing switches it off", { tags: ["feat:fl-trigger-schedule", "shard:schedule", "lvl:api"] }, async () => {
  const { a, http } = await actor("sched-owner");
  const now = await serverNow();
  const { cron, minute } = await nextMinuteCron();
  const f = await newFlow(http, a.workspaceId, `Schedule info ${seeded("sched-1", 4)}`, graph(cron));
  const pub = await http.post(`/api/flows/${f.id}/publish`);
  expect(pub.status).toBe(201);
  expect(pub.json.trigger).toBe("trigger.schedule");
  expect(pub.json.schedule).toMatchObject({ cron, timezone: "UTC" });
  const next = new Date(pub.json.schedule.nextFireAt);
  expect(next.getUTCMinutes()).toBe(minute);
  expect(next.getUTCSeconds()).toBe(0);
  expect(next.getTime()).toBeGreaterThan(now.getTime());
  expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(125_000);
  const info = (await http.get(`/api/flows/${f.id}/publish`)).json;
  expect(info.schedule).toMatchObject({ cron, timezone: "UTC", missedPolicy: "skip", active: true });
  expect((await http.del(`/api/flows/${f.id}/publish`)).status).toBe(200);
  expect((await http.get(`/api/flows/${f.id}/publish`)).json.schedule.active).toBe(false);
  for (const [name, bad, tz] of [["too frequent", "*/2 * * * *", "UTC"], ["not cron", "every day", "UTC"], ["bad zone", "0 9 * * 1", "Mars/Olympus"]] as const) {
    const g = await newFlow(http, a.workspaceId, `Schedule bad ${seeded(name, 4)}`, graph(bad, tz));
    const issues = (await http.get(`/api/flows/${g.id}`)).json.issues as { code: string }[];
    expect(issues.map((i) => i.code), name).toContain("INVALID_SCHEDULE");
    expect((await http.post(`/api/flows/${g.id}/publish`)).status, name).toBe(422);
  }
});

test("[fl-trigger-schedule.2] the worker's scheduler starts a run at the scheduled minute, once, with the fire time as input", { tags: ["feat:fl-trigger-schedule", "shard:schedule", "lvl:job"], timeout: 200_000 }, async () => {
  const { a, http } = await actor("sched-owner-2");
  const { cron } = await nextMinuteCron();
  const f = await newFlow(http, a.workspaceId, `Schedule fire ${seeded("sched-2", 4)}`, graph(cron));
  expect((await http.post(`/api/flows/${f.id}/publish`)).status).toBe(201);
  expect(((await http.get(`/api/flows/${f.id}/runs`)).json.runs as unknown[]).length).toBe(0);
  let runId = "";
  await expect
    .poll(async () => {
      const runs = (await http.get(`/api/flows/${f.id}/runs`)).json.runs as { id: string; triggerKind: string }[];
      runId = runs.find((r) => r.triggerKind === "schedule")?.id ?? "";
      return runId;
    }, { timeout: 150_000, interval: 2000, message: "the scheduler never fired the published schedule" })
    .not.toBe("");
  const run = await waitRun(http, runId);
  expect(run.status).toBe("succeeded");
  expect(run.triggerKind).toBe("schedule");
  expect(run.output.result).toMatchObject({ tz: "UTC", catchUp: false });
  expect(new Date(run.output.result.scheduled).getUTCSeconds()).toBe(0);
  expect(run.triggerRef).toBe(run.output.result.scheduled);
  await expect.poll(async () => ((await http.get(`/api/flows/${f.id}/runs`)).json.runs as unknown[]).length, { timeout: 8000, interval: 2000 }).toBe(1);
});
