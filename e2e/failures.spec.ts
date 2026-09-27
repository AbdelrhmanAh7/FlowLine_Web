import { expect, test } from "@playwright/test";
import { expectSaved, injectFault, resetFaults, setupUser } from "./helpers";

test.afterEach(async ({ page }) => {
  await resetFaults(page.request);
});

test("invalid flow: run is blocked with reasons, fields show errors, API refuses", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "blank" });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await page.getByRole("button", { name: "+ Add a trigger" }).click();
  const drawer = page.getByTestId("node-drawer");
  await drawer.getByLabel("Sample payload (JSON)").fill("{ not json");
  await expect(drawer.getByRole("alert")).toContainText("Invalid JSON");
  await page.keyboard.press("Escape");

  const run = page.getByRole("button", { name: "▶ Run" });
  await expect(run).toHaveAttribute("aria-disabled", "true");
  await expect(run).toHaveAccessibleDescription(/Fix \d+ issues? before running/);

  await page.getByRole("button", { name: /\d+ issues?/ }).click();
  const issues = page.getByRole("dialog", { name: "Flow issues" });
  await expect(issues).toContainText("Add an Output node");
  await expect(issues).toContainText("sample payload is not valid JSON");

  // Ctrl+Enter must not start a run either.
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 600 } });
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("run-dock")).toHaveCount(0);

  // Server-side validation is authoritative.
  await expectSaved(page);
  const res = await page.request.post(`/api/flows/${flowId}/runs`, { data: {} });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe("INVALID_FLOW");
});

test("save failure: silent retries then recovery, and manual retry after repeated failures", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  const status = page.getByTestId("save-status");

  // Two failures are absorbed by the 1s/2s backoff.
  await injectFault(page.request, "save", 2);
  await page.getByLabel("Flow name").fill("Retry me");
  await expect(status).toHaveAttribute("data-status", "retrying", { timeout: 10_000 });
  await expect(status).toContainText("Failed to save — retrying");
  await expectSaved(page);

  // Four failures exhaust the retries → explicit Retry.
  await injectFault(page.request, "save", 10);
  await page.getByLabel("Flow name").fill("Retry me harder");
  await expect(status).toHaveAttribute("data-status", "failed", { timeout: 20_000 });
  await resetFaults(page.request);
  await status.getByRole("button", { name: "Retry" }).click();
  await expectSaved(page);
  const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
  expect(flow.name).toBe("Retry me harder");
});

test("load failure: the canvas shows an error with a working Retry", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  await injectFault(page.request, "load", 4);
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  // The shell (sidebar) renders immediately even while the flow is failing.
  await expect(page.getByRole("complementary", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByText("Couldn't load this flow")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
});

test("offline: edits kept locally, run disabled, reconciled on reconnect", async ({ page, context }) => {
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  await context.setOffline(true);
  await expect(page.getByText("Offline mode")).toBeVisible();
  await page.getByLabel("Flow name").fill("Edited offline");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "offline");
  await expect(page.getByRole("button", { name: "▶ Run" })).toHaveAttribute("aria-disabled", "true");
  const draftKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("flowline:draft:")));
  expect(draftKeys).toHaveLength(1);
  const draft = await page.evaluate((k) => localStorage.getItem(k), draftKeys[0]!);
  expect(draft).toContain("Edited offline");
  expect(draft).not.toMatch(/password|token|secret/i);

  await context.setOffline(false);
  await expectSaved(page);
  const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
  expect(flow.name).toBe("Edited offline");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("flowline:draft:")).length)).toBe(0);
});

test("offline conflict: newer server copy is never silently overwritten", async ({ page, context }) => {
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  await context.setOffline(true);
  await page.getByLabel("Flow name").fill("Mine (offline)");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "offline");

  // Someone else saves meanwhile (server-side change through the API with the same account).
  await context.setOffline(false);
  await context.setOffline(true);
  const other = await context.browser()!.newContext({ baseURL: "http://localhost:3100", extraHTTPHeaders: { origin: "http://localhost:3100" }, storageState: await context.storageState() });
  const current = (await (await other.request.get(`/api/flows/${flowId}`)).json()).flow;
  const put = await other.request.put(`/api/flows/${flowId}`, { data: { name: "Theirs (server)", baseRevision: current.revision } });
  expect(put.ok()).toBeTruthy();

  await context.setOffline(false);
  const banner = page.getByRole("alert").filter({ hasText: "This flow changed elsewhere" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const mid = (await (await other.request.get(`/api/flows/${flowId}`)).json()).flow;
  expect(mid.name).toBe("Theirs (server)");

  await banner.getByRole("button", { name: "Keep my version" }).click();
  await expectSaved(page);
  const after = (await (await other.request.get(`/api/flows/${flowId}`)).json()).flow;
  expect(after.name).toBe("Mine (offline)");
  const versions = (await (await other.request.get(`/api/flows/${flowId}/versions`)).json()).versions;
  expect(versions.some((v: { reason: string }) => v.reason === "overwrite")).toBeTruthy();
  await other.close();
});
