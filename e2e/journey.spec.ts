import { expect, test } from "@playwright/test";
import { connect, expectSaved, nodeIds, PASSWORD, uniqueEmail } from "./helpers";

/**
 * The Phase 1 acceptance journey, entirely through the UI as a brand-new user:
 * landing → sign up → onboarding → build a flow on the canvas (drag, connect,
 * configure) → autosave → reload → run → inspect → verify persisted backend state.
 */
test("new user builds, saves, reopens, runs and inspects a flow", async ({ page }) => {
  const email = uniqueEmail("journey");
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  // Landing → sign up
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Automate anything/ })).toBeVisible();
  await page.getByRole("link", { name: "Start free" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  // OAuth is not configured in the test env: buttons must say so, not pretend.
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Name").fill("Journey Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding: workspace → goal → first flow
  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
  await page.getByLabel("Workspace name").fill("Journey Co");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What do you want to automate first?" })).toBeVisible();
  await page.getByRole("radio", { name: /Sales & lead ops/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /Blank flow/ }).click();
  await page.getByRole("button", { name: /Create flow & open canvas/ }).click();

  // Builder: empty state
  await expect(page).toHaveURL(/\/w\/journey-co(-\d+)?\/flows\/[0-9a-f-]{36}$/);
  const flowId = page.url().split("/").pop()!;
  await expect(page.getByText("Start with a trigger")).toBeVisible();

  // Drag four nodes from the palette onto the canvas.
  const pane = page.locator(".react-flow__pane");
  const drop = async (option: RegExp, x: number, y: number) => {
    await page.getByRole("button", { name: /Add node/ }).click();
    await page.getByRole("option", { name: option }).dragTo(pane, { targetPosition: { x, y } });
    await page.keyboard.press("Escape"); // close drawer for the new node
  };
  await drop(/Manual trigger/, 150, 480);
  await drop(/JSON transform/, 430, 480);
  await drop(/Condition/, 710, 480);
  await drop(/^◎?\s*Output/, 990, 480);
  const ids = await nodeIds(page);
  expect(ids).toHaveLength(4);
  const [trigger, transform, condition, output] = ids as [string, string, string, string];

  // Wire them up with real mouse drags.
  await connect(page, trigger, transform);
  await connect(page, transform, condition);
  await connect(page, condition, output, "true");
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  // Configure nodes in the drawer.
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  const drawer = page.getByTestId("node-drawer");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Name").fill("Shape lead");
  await drawer.getByLabel("Expression (JSONata)").fill('{ "name": lead.name, "size": lead.employees }');
  await page.keyboard.press("Escape"); // blur field
  await page.keyboard.press("Escape"); // close drawer

  await page.locator(`.react-flow__node[data-id="${condition}"]`).click();
  await drawer.getByLabel("Condition (JSONata)").fill("size >= 50");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.locator(`.react-flow__node[data-id="${output}"]`).click();
  await drawer.getByLabel("Output key").fill("qualified");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Autosave, then reopen from the server.
  await expect(page.getByRole("button", { name: /issue/ })).toHaveCount(0);
  await expectSaved(page);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await page.locator(`.react-flow__node[data-id="${transform}"]`).click();
  await expect(page.getByTestId("node-drawer").getByLabel("Expression (JSONata)")).toHaveValue('{ "name": lead.name, "size": lead.employees }');
  await page.keyboard.press("Escape");

  // Run with the keyboard shortcut, from the canvas (not a text field).
  await pane.click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("Control+Enter");
  const dock = page.getByTestId("run-dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByText("SUCCESS", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`.react-flow__node[data-id="${output}"]`)).toContainText(/\d+ms|reused/);

  // Inspect input/output in the run inspector.
  await dock.getByRole("link", { name: /Open in inspector/ }).click();
  await expect(page).toHaveURL(/\/runs\?run=/);
  const panel = page.getByTestId("step-panel");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: /Shape lead/ }).first().click();
  await panel.getByRole("tab", { name: "Input" }).click();
  await expect(panel.locator("pre").first()).toContainText('"employees": 120');
  await panel.getByRole("tab", { name: "Output" }).click();
  await expect(panel.locator("pre").first()).toContainText('"size": 120');

  // Backend state really persisted.
  const flowRes = await page.request.get(`/api/flows/${flowId}`);
  expect(flowRes.ok()).toBeTruthy();
  const { flow, issues } = await flowRes.json();
  expect(issues).toEqual([]);
  expect(flow.graph.nodes).toHaveLength(4);
  expect(flow.graph.edges).toHaveLength(3);
  expect(flow.revision).toBeGreaterThan(1);
  const runs = (await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs;
  expect(runs).toHaveLength(1);
  const run = (await (await page.request.get(`/api/runs/${runs[0].id}`)).json()).run;
  expect(run.status).toBe("succeeded");
  expect(run.output).toEqual({ qualified: { name: "Ada Lovelace", size: 120 } });
  expect(run.steps.map((s: { status: string }) => s.status)).toEqual(["succeeded", "succeeded", "succeeded", "succeeded"]);
  const versions = (await (await page.request.get(`/api/flows/${flowId}/versions`)).json()).versions;
  expect(versions.some((v: { reason: string }) => v.reason === "run")).toBeTruthy();

  expect(consoleErrors.filter((e) => !/Download the React DevTools/.test(e))).toEqual([]);
});
