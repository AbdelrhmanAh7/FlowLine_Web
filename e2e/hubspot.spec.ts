import { expect, test } from "@playwright/test";
import { expectSaved, setupUser } from "./helpers";
import { FAKE_PROVIDER } from "./stack";

// Untagged: the full Chromium CI tier runs this journey; Firefox/WebKit select their own tagged suites.
test("HubSpot: connect a private app, configure List contacts, run, and retain the not-live-verified badge", async ({ page }) => {
  test.setTimeout(120_000);
  const { workspace, flowId } = await setupUser(page, { template: "blank" });
  const issued = await page.request.post(`${FAKE_PROVIDER}/__fake/issue-token`, { data: { account: "a" } });
  expect(issued.ok()).toBeTruthy();
  const { token } = await issued.json() as { token: string };
  const consoleMessages: string[] = [];
  page.on("console", (msg) => consoleMessages.push(msg.text()));

  await page.goto(`/w/${workspace.slug}/integrations`);
  const card = page.getByRole("listitem").filter({ has: page.getByText("HubSpot", { exact: true }) });
  await expect(card).toContainText("live: blocked");
  await expect(card).toContainText("beta: not yet verified live");
  await expect(card).not.toContainText("✓ live verified");
  await card.locator("summary").click();
  await expect(card.getByText("List contacts", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Connect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect HubSpot" });
  await expect(dialog).toContainText("Live verification is pending.");
  await dialog.getByLabel("Label (optional)").fill("HubSpot E2E contacts");
  const secret = dialog.getByLabel("Private app token", { exact: true });
  await expect(secret).toHaveAttribute("type", "password");
  await expect(secret).toHaveAttribute("dir", "ltr");
  await secret.fill(token);
  const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/api/workspaces/${workspace.id}/connections`));
  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  const connectionResponse = await created;
  expect(connectionResponse.status()).toBe(201);
  expect(await connectionResponse.text()).not.toContain(token);
  const { connection } = await connectionResponse.json() as { connection: { id: string } };
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("connection-hubspot")).toContainText("Connected");
  await page.reload();
  await expect(page.getByTestId("connection-hubspot")).toContainText("HubSpot E2E contacts");
  await expect(card).toContainText("beta: not yet verified live");

  // Fixture graph only: all action/connection/mapping configuration is performed in the drawer below.
  const saved = await page.request.put(`/api/flows/${flowId}`, { data: {
    baseRevision: 1,
    graph: {
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 0, y: 120 }, data: { label: "Start", config: { samplePayload: "{}" } } },
        { id: "contacts", type: "integration.action", position: { x: 300, y: 120 }, data: { label: "HubSpot contacts", config: { actionId: "", connectionId: "", inputMapping: "{}", requireApproval: false, retry: { maxAttempts: 3 } } } },
        { id: "o", type: "output", position: { x: 600, y: 120 }, data: { label: "Result", config: { key: "contacts", expression: "" } } },
      ],
      edges: [{ id: "e1", source: "t", target: "contacts" }, { id: "e2", source: "contacts", target: "o" }],
    },
  } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await page.locator('.react-flow__node[data-id="contacts"]').click();
  const drawer = page.getByTestId("node-drawer");
  await drawer.getByLabel("App", { exact: true }).selectOption("hubspot");
  await drawer.getByLabel("Action", { exact: true }).selectOption("hubspot.list_contacts");
  const connections = drawer.getByLabel("Connection", { exact: true });
  await expect(connections.locator(`option[value="${connection.id}"]`)).toHaveCount(1);
  await connections.selectOption(connection.id);
  await drawer.getByLabel("Input mapping (JSONata → object)").fill('{ "limit": 1, "properties": ["email"] }');
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectSaved(page);
  await page.reload();
  await expect(page.locator('.react-flow__node[data-id="contacts"]')).toContainText("HUBSPOT · LIST CONTACTS");
  await page.getByRole("button", { name: "▶ Run" }).click();
  const dock = page.getByTestId("run-dock");
  await expect(dock.getByText("Success", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
  const runsResponse = await page.request.get(`/api/flows/${flowId}/runs`);
  expect(runsResponse.ok()).toBeTruthy();
  const { runs } = await runsResponse.json() as { runs: { id: string; status: string }[] };
  expect(runs).toHaveLength(1);
  expect(runs[0]!.status).toBe("succeeded");
  const detail = await page.request.get(`/api/runs/${runs[0]!.id}`);
  expect(detail.ok()).toBeTruthy();
  const detailText = await detail.text();
  expect(detailText).not.toContain(token);
  const { run } = JSON.parse(detailText) as { run: { steps: { nodeId: string; status: string; output: unknown }[] } };
  expect(run.steps.find((s) => s.nodeId === "contacts")).toMatchObject({ status: "succeeded", output: { contacts: [{ id: "501", properties: { email: "alice@example.com" } }] } });
  expect(run.steps.find((s) => s.nodeId === "o")!.status).toBe("succeeded");
  const graphResponse = await page.request.get(`/api/flows/${flowId}`);
  expect(graphResponse.ok()).toBeTruthy();
  expect(await graphResponse.text()).not.toContain(token);
  expect(consoleMessages.join("\n")).not.toContain(token);
  expect(JSON.stringify(await page.context().storageState())).not.toContain(token);
  expect(page.url()).not.toContain(token);
  expect(await page.content()).not.toContain(token);

  await page.goto(`/w/${workspace.slug}/integrations`);
  await expect(card).toContainText("live: blocked");
  await expect(card).toContainText("beta: not yet verified live");
  await expect(card).not.toContainText("✓ live verified");
});
