import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectSaved, setupUser } from "./helpers";

/**
 * Phase 2 journeys through the real UI. Only the provider boundary is doubled:
 * SaaS APIs → e2e/fakes/provider-server.ts (:4010), AI → e2e/fakes/ai-server.ts (:4011).
 * Every test uses unique spreadsheet/channel ids so parallel workers never share fake state.
 */
const FAKE = "http://127.0.0.1:4010";

async function fault(req: APIRequestContext, provider: string, pathPattern: string, mode: "500" | "429" | "timeout", times: number) {
  const r = await req.post(`${FAKE}/__fake/fault`, { data: { provider, pathPattern, mode, times } });
  expect(r.ok()).toBeTruthy();
}
async function sheetRows(req: APIRequestContext, id: string): Promise<unknown[][]> {
  const st = (await (await req.get(`${FAKE}/__fake/state/google_sheets`)).json()) as { sheets: Record<string, unknown[][]> };
  return st.sheets[id] ?? [];
}
async function slackMessages(req: APIRequestContext, channel: string): Promise<{ text: string }[]> {
  const st = (await (await req.get(`${FAKE}/__fake/state/slack`)).json()) as { messages: { channel: string; text: string }[] };
  return st.messages.filter((m) => m.channel === channel);
}
async function latestRuns(req: APIRequestContext, flowId: string) {
  return (await (await req.get(`/api/flows/${flowId}/runs`)).json()).runs as { id: string; number: number; status: string }[];
}
async function stepStatuses(req: APIRequestContext, runId: string) {
  const run = (await (await req.get(`/api/runs/${runId}`)).json()).run as { steps: { nodeId: string; status: string }[] };
  return Object.fromEntries(run.steps.map((s) => [s.nodeId, s.status]));
}

/** Connect an OAuth app through the UI: dialog → fake consent → callback → back on Integrations. */
async function connectOAuth(page: Page, slug: string, name: string, provider: string) {
  await page.goto(`/w/${slug}/integrations`);
  await page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) }).getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: `Connect ${name}` });
  await dialog.getByRole("button", { name: `Continue to ${name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/integrations`));
  await expect(page.getByTestId(`connection-${provider}`)).toBeVisible();
}

async function openNode(page: Page, id: string) {
  await page.locator(`.react-flow__node[data-id="${id}"]`).click();
  const drawer = page.getByTestId("node-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}
/** Choose the workspace's (only) connection for this action node. */
async function pickConnection(drawer: Locator) {
  const select = drawer.getByLabel("Connection");
  const label = (await select.locator("option").allTextContents()).find((o) => o && !o.startsWith("Choose") && !o.startsWith("No "));
  expect(label, "a connection is offered").toBeTruthy();
  await select.selectOption({ label: label! });
}
async function closeDrawer(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

async function saveGraph(req: APIRequestContext, flowId: string, graph: unknown) {
  const res = await req.put(`/api/flows/${flowId}`, { data: { baseRevision: 1, graph } });
  expect(res.ok(), await res.text()).toBeTruthy();
}
const pos = (i: number) => ({ x: 300 * i, y: 120 });
const manual = { id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: '{ "name": "Ada" }' } } };
const out = (i: number) => ({ id: "o", type: "output", position: pos(i), data: { label: "Done", config: { key: "done", expression: "" } } });
const act = (id: string, label: string, i: number, actionId: string, connectionId: string, inputMapping: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "integration.action",
  position: pos(i),
  data: { label, config: { actionId, connectionId, inputMapping, requireApproval: false, retry: { maxAttempts: 3 }, ...extra } },
});
const line = (...ids: string[]) => ids.slice(1).map((id, i) => ({ id: `e${i}`, source: ids[i]!, target: id, sourceHandle: null }));
async function createConn(req: APIRequestContext, wid: string, provider: string) {
  const res = await req.post(`/api/workspaces/${wid}/connections`, { data: { provider, label: `${provider} (e2e)`, fields: { token: "test-token" } } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).connection.id as string;
}

test("template journey: connect apps via OAuth, finish setup in the canvas, Sheets fails, re-run from that step without duplicates", async ({ page }) => {
  test.setTimeout(150_000);
  const { workspace } = await setupUser(page);
  const sheetId = `sheet-e2e-${randomUUID().slice(0, 8)}`;
  const channel = `C_E2E_${randomUUID().slice(0, 8)}`;

  await connectOAuth(page, workspace.slug, "Google Sheets", "google_sheets");
  await connectOAuth(page, workspace.slug, "Slack", "slack");

  // The template shows real requirement status, then creates an independent flow.
  await page.goto(`/w/${workspace.slug}/templates`);
  const card = page.getByTestId("template-lead-enrichment");
  await expect(card.getByRole("list", { name: "Requirements" })).not.toContainText("Not connected");
  await card.getByRole("button", { name: "Use template" }).click();
  await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  const flowId = page.url().split("/").pop()!;
  const run = page.getByRole("button", { name: "▶ Run" });
  await expect(run).toHaveAttribute("aria-disabled", "true"); // setup required

  // Finish setup in the node drawers: choose connections and edit the mappings.
  let drawer = await openNode(page, "sheet");
  await pickConnection(drawer);
  await drawer
    .getByLabel("Input mapping (JSONata → object)")
    .fill(`{ "spreadsheetId": "${sheetId}", "range": "Leads!A1", "row": [$steps.hook.body.lead.name, $steps.enrich.company, $steps.score.label] }`);
  await closeDrawer(page);
  drawer = await openNode(page, "slack");
  await pickConnection(drawer);
  await drawer.getByLabel("Input mapping (JSONata → object)").fill(`{ "channel": "${channel}", "text": "Hot lead: " & $steps.hook.body.lead.name }`);
  await closeDrawer(page);
  await expectSaved(page);
  await expect(run).not.toHaveAttribute("aria-disabled", "true");

  // Sheets returns 5xx for every bounded retry of this step.
  await fault(page.request, "google_sheets", sheetId, "500", 3);
  await run.click();
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText("FAILED").first()).toBeVisible({ timeout: 45_000 });
  expect(await sheetRows(page.request, sheetId)).toHaveLength(0);
  expect(await slackMessages(page.request, channel)).toHaveLength(0);
  const [first] = await latestRuns(page.request, flowId);
  expect(await stepStatuses(page.request, first!.id)).toMatchObject({ hook: "succeeded", enrich: "succeeded", score: "succeeded", sheet: "failed" });

  // Re-run from the failed step through the inspector with a preview.
  await dock.getByRole("link", { name: /Open in inspector/ }).click();
  await page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Sheets — Add row/ }).click();
  await page.getByTestId("step-panel").getByRole("button", { name: /Re-run from this step/ }).click();
  const dialog = page.getByRole("dialog", { name: /Re-run #1 from/ });
  const preview = dialog.getByTestId("rerun-preview");
  await expect(preview).toContainText("Sheets — Add row");
  await expect(preview).toContainText(/Reused from #1 · 4/);
  await expect(preview).toContainText("Enrich lead");
  await dialog.getByRole("button", { name: /^Re-run \d+ steps?$/ }).click();
  await expect(page.getByText(/Re-running as #2/)).toBeVisible();
  await expect.poll(async () => (await latestRuns(page.request, flowId))[0]!.status, { timeout: 30_000 }).toBe("succeeded");

  const [second] = await latestRuns(page.request, flowId);
  expect(await stepStatuses(page.request, second!.id)).toMatchObject({ hook: "reused", enrich: "reused", score: "reused", isHot: "reused", sheet: "succeeded", slack: "succeeded" });
  expect(await sheetRows(page.request, sheetId)).toHaveLength(1);
  expect(await slackMessages(page.request, channel)).toHaveLength(1);
  // AI was billed once per AI step: the re-run reused those outputs.
  const usage = (await (await page.request.get(`/api/workspaces/${workspace.id}/usage`)).json()) as { rows: { kind: string; events: number }[] };
  expect(usage.rows.filter((r) => r.kind === "ai").reduce((n, r) => n + r.events, 0)).toBe(2);
});

test("double-clicked Run starts one run, and Cancel stops it mid-request", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "blank" });
  const sheetId = `sheet-e2e-${randomUUID().slice(0, 8)}`;
  const conn = await createConn(page.request, workspace.id, "google_sheets");
  await saveGraph(page.request, flowId!, {
    nodes: [manual, act("sheet", "Add row", 1, "google_sheets.append_row", conn, `{ "spreadsheetId": "${sheetId}", "range": "A1", "row": [name] }`), out(2)],
    edges: line("t", "sheet", "o"),
  });
  await fault(page.request, "google_sheets", sheetId, "timeout", 1); // the provider never answers
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await page.getByRole("button", { name: "▶ Run" }).dblclick();
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText("RUNNING").first()).toBeVisible({ timeout: 20_000 });
  expect(await latestRuns(page.request, flowId!)).toHaveLength(1);

  await dock.getByRole("button", { name: "Cancel run" }).click();
  await expect(dock.getByText("CANCELLED").first()).toBeVisible({ timeout: 15_000 });
  const runs = await latestRuns(page.request, flowId!);
  expect(runs).toHaveLength(1);
  expect(runs[0]!.status).toBe("cancelled");
  expect(await stepStatuses(page.request, runs[0]!.id)).toMatchObject({ o: expect.stringMatching(/pending|skipped|cancelled/) });
});

test("approval: a gated Slack post waits, is approved in the inspector, and posts exactly once", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "blank" });
  const channel = `C_E2E_${randomUUID().slice(0, 8)}`;
  const conn = await createConn(page.request, workspace.id, "slack");
  await saveGraph(page.request, flowId!, {
    nodes: [manual, act("post", "Post to Slack", 1, "slack.post_message", conn, `{ "channel": "${channel}", "text": "Hello " & name }`, { requireApproval: true }), out(2)],
    edges: line("t", "post", "o"),
  });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await page.getByRole("button", { name: "▶ Run" }).click();
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText("NEEDS APPROVAL").first()).toBeVisible({ timeout: 20_000 });
  expect(await slackMessages(page.request, channel)).toHaveLength(0);

  await dock.getByRole("link", { name: /Open in inspector/ }).click();
  await page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Post to Slack/ }).click();
  const panel = page.getByTestId("step-panel");
  await expect(panel).toContainText(channel); // the exact args being approved are shown
  await panel.getByRole("button", { name: "Approve" }).click();
  await expect.poll(async () => (await latestRuns(page.request, flowId!))[0]!.status, { timeout: 20_000 }).toBe("succeeded");
  expect(await slackMessages(page.request, channel)).toEqual([expect.objectContaining({ text: "Hello Ada" })]);
});

test("mobile: Phase 2 pages fit a phone screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { workspace } = await setupUser(page);
  for (const path of ["integrations", "templates", "runs", "settings"]) {
    await page.goto(`/w/${workspace.slug}/${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});
