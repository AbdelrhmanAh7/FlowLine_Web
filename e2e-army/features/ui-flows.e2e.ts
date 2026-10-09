// UI FLOWS shard (agent steps + exact checks): the flows list, the workspace navigation, the templates gallery and the run history inspector.
// The signed-in owner (session fl-user, English UI) comes from _setup.e2e.ts; each test prepares its own data through the API in a FRESH workspace
// so lists and counts are exact.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase, needsModel, seeded } from "../lib.ts";
import { actor, chain, newFlow, startRun, waitRun } from "./_helpers.ts";

/** A new workspace of the session's owner (the browser stays signed in as the same user). */
async function fresh(label: string) {
  const { http } = await actor("ui-owner");
  const ws = (await http.post("/api/workspaces", { json: { name: `UI ${seeded(label, 5)}` } })).json.workspace as { id: string; slug: string; name: string };
  return { http, ws };
}

test("[fl-flows-list.1] the owner creates a new blank flow from the flows list and lands on its canvas", { session: "fl-user", tags: ["feat:fl-flows-list", "shard:ui-flows", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http, ws } = await fresh("flows-list-1");
  await app.open(`/w/${ws.slug}/flows`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Flows");
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  await agent.act("create a new blank flow and open its canvas");
  await expect(browser).toHaveURL(new RegExp(`/w/${ws.slug}/flows/[0-9a-f-]{36}$`));
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  await agent.assert("the flow builder canvas is shown and invites the user to start with a trigger");
  const flows = (await http.get(`/api/workspaces/${ws.id}/flows`)).json.flows as { name: string; nodeCount: number }[];
  expect(flows).toHaveLength(1);
  expect(flows[0]).toMatchObject({ name: "Untitled flow", nodeCount: 0 });
});

test("[fl-flows-list.2] searching the flows list narrows it to the matching flows and can be cleared", { session: "fl-user", tags: ["feat:fl-flows-list", "shard:ui-flows", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http, ws } = await fresh("flows-list-2");
  const names = [`Invoices digest ${seeded("fl2-a", 3)}`, `Lead router ${seeded("fl2-b", 3)}`, `Invoices archive ${seeded("fl2-c", 3)}`];
  for (const n of names) await newFlow(http, ws.id, n, chain({ n: 1 }, "$"));
  await app.open(`/w/${ws.slug}/flows`);
  for (const n of names) await expect(screen.getByRole("link", n)).toBeVisible();
  await agent.act("search the flows for {q}", { params: { q: "invoices" } });
  await expect(screen.getByRole("link", names[0]!)).toBeVisible();
  await expect(screen.getByRole("link", names[2]!)).toBeVisible();
  await expect(screen.getByRole("link", names[1]!)).toBeHidden();
  await agent.act("search the flows for {q}", { params: { q: "zzz-nothing" } });
  await expect(screen.getByText("No flows match your search")).toBeVisible();
  await screen.getByRole("button", "Clear search").tap();
  await expect(screen.getByRole("link", names[1]!)).toBeVisible();
});

test("[fl-workspace-nav.1] the workspace navigation reaches Run history and Templates", { session: "fl-user", tags: ["feat:fl-workspace-nav", "shard:ui-flows", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { ws } = await fresh("nav-1");
  await app.open(`/w/${ws.slug}/flows`);
  await expect(screen.getByRole("complementary", "Workspace navigation")).toBeVisible();
  await agent.act("open the Run history page");
  await expect(browser).toHaveURL(`/w/${ws.slug}/runs`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Run history");
  await agent.assert("a Run history page (possibly empty) is shown inside the workspace");
  await screen.getByRole("link", "Templates").tap();
  await expect(browser).toHaveURL(`/w/${ws.slug}/templates`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Templates");
  for (const label of ["Flows", "Agents", "Knowledge", "Integrations", "Settings"]) await expect(screen.getByRole("complementary", "Workspace navigation").getByRole("link", label)).toBeVisible();
});

test("[fl-templates.1] choosing a ready-made template creates a flow from it and opens it on the canvas", { session: "fl-user", tags: ["feat:fl-templates", "shard:ui-flows", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http, ws } = await fresh("templates-1");
  await app.open(`/w/${ws.slug}/templates`);
  await expect(screen.getByTestId("template-order-totals")).toBeVisible();
  await expect(screen.getByTestId("template-lead-qualifier")).toBeVisible();
  await agent.act("use the Order Totals Digest template");
  await expect(browser).toHaveURL(new RegExp(`/w/${ws.slug}/flows/[0-9a-f-]{36}$`));
  await expect(screen.getByTestId("node-sum")).toBeVisible();
  await expect(screen.getByTestId("node-big")).toBeVisible();
  await agent.assert("the canvas shows a flow with a trigger, a step that sums the items and a condition that checks the total");
  const flows = (await http.get(`/api/workspaces/${ws.id}/flows`)).json.flows as { name: string; nodeCount: number }[];
  expect(flows).toEqual([expect.objectContaining({ name: "Order Totals Digest", nodeCount: 5 })]);
});

test("[fl-run-history.1] the run history lists runs and the inspector shows a failed run's steps and error", { session: "fl-user", tags: ["feat:fl-run-history", "shard:ui-flows", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http, ws } = await fresh("run-history-1");
  const good = await newFlow(http, ws.id, `Good run ${seeded("rh-good", 3)}`, chain({ n: 1 }, "$"));
  const bad = await newFlow(http, ws.id, `Bad run ${seeded("rh-bad", 3)}`, chain({ n: 1 }, '$number("abc")'));
  await waitRun(http, (await startRun(http, good.id)).json.run.id);
  const failed = await waitRun(http, (await startRun(http, bad.id)).json.run.id);
  expect(failed.status).toBe("failed");
  await app.open(`/w/${ws.slug}/runs?status=failed`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Run history");
  await agent.act("open the failed run and look at the step that failed");
  await expect(screen.getByText(`#${failed.number}`).first()).toBeVisible();
  await agent.assert("the run details show the steps of the run and one step is marked as failed with an error message");
  await app.open(`/w/${ws.slug}/runs`);
  await expect(screen.getByText(bad.name).first()).toBeVisible();
  await expect(screen.getByText(good.name).first()).toBeVisible();
});

test("[fl-workspace-nav.2] the workspace shell is Arabic and right-to-left: translated navigation on the right, nothing overflows", { session: "fl-user", tags: ["feat:fl-workspace-nav", "shard:ui-flows", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { ws } = await fresh("nav-2");
  await browser.setCookies([{ url: apiBase(), name: "fl_locale", value: "ar" }]);
  await app.open(`/w/${ws.slug}/flows`);
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
  expect(await browser.evaluate(() => document.documentElement.lang)).toBe("ar");
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("المسارات");
  const nav = screen.getByRole("complementary", "التنقّل في مساحة العمل");
  await expect(nav).toBeVisible();
  for (const label of ["المسارات", "القوالب", "الوكلاء", "المعرفة", "سجل التشغيل", "التكاملات", "الإعدادات"]) await expect(nav.getByRole("link", label)).toBeVisible();
  expect(await browser.evaluate(() => document.querySelector("aside")!.getBoundingClientRect().left > window.innerWidth / 2)).toBe(true);
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await agent.act("open the Run history page");
  await expect(browser).toHaveURL(`/w/${ws.slug}/runs`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("سجل التشغيل");
  await agent.assert("the Run history page is shown in Arabic inside the workspace");
});
