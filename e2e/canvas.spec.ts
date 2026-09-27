import { expect, test } from "@playwright/test";
import { expectSaved, nodeIds, setupUser } from "./helpers";

test.describe("canvas interactions & keyboard map", () => {
  test("select, duplicate, nudge, delete, undo/redo, Esc, and typing guards", { tag: "@critical" }, async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(5);

    // Select → drawer opens; Esc closes and deselects.
    const transform = page.locator('.react-flow__node[data-id="normalise"]');
    await transform.click();
    const drawer = page.getByTestId("node-drawer");
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    // Typing guard: Delete/Backspace inside a drawer field must not delete the node, Ctrl+Enter must not run.
    await transform.click();
    const nameField = drawer.getByLabel("Name");
    await nameField.click();
    await nameField.press("End");
    await nameField.press("Backspace");
    await nameField.press("Delete");
    await nameField.press("Control+Enter");
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    await expect(page.getByTestId("run-dock")).toHaveCount(0);
    await expect(nameField).toHaveValue("Normalise lea");

    // Arrow nudge = 12px (Shift = 1px) while the canvas has focus.
    await page.keyboard.press("Escape"); // blur field
    const before = await transform.boundingBox();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    // Screen delta = flow delta × zoom, so read the zoom from the viewport transform.
    const zoom = await page.locator(".react-flow__viewport").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    await expect.poll(async () => Math.round(((await transform.boundingBox())!.x - before!.x) / zoom)).toBe(12);
    expect(Math.round(((await transform.boundingBox())!.y - before!.y) / zoom)).toBe(1);

    // Ctrl+D duplicates the selection.
    await page.keyboard.press("Control+d");
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    await expect(page.locator(".react-flow__node").filter({ hasText: "Normalise lea copy" })).toHaveCount(1);

    // Delete removes the selected duplicate; Ctrl+Z restores it; Ctrl+Shift+Z re-applies.
    await page.keyboard.press("Delete");
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(5);

    // Trigger can't be duplicated (only one per flow) — explained, not silently ignored.
    await page.locator('.react-flow__node[data-id="trigger"]').click();
    await page.keyboard.press("Escape");
    await page.locator('.react-flow__node[data-id="trigger"]').click();
    await page.keyboard.press("Control+d");
    await expect(page.getByRole("status").filter({ hasText: "A flow can only have one trigger" })).toBeVisible();

    // Ctrl+0 fits, zoom controls work, Ctrl+J toggles the run dock.
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.keyboard.press("Control+0");
    await page.keyboard.press("Control+j");
    await expect(page.getByTestId("run-dock")).toBeVisible();
    await page.keyboard.press("Control+j");
    await expect(page.getByTestId("run-dock")).toHaveCount(0);

    // "/" opens node search, focused.
    await page.keyboard.press("Escape");
    await page.keyboard.press("/");
    await expect(page.getByRole("textbox", { name: "Search nodes" })).toBeFocused();
    await page.keyboard.type("cond");
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");

    await expectSaved(page);
    const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
    expect(flow.graph.nodes.find((n: { id: string }) => n.id === "normalise").data.label).toBe("Normalise lea");
  });

  test("arrow nudge is exactly 12px (Shift 1px) when the node itself has focus (regression: Codex CR-01)", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    const node = page.locator('.react-flow__node[data-id="normalise"]');
    await node.click(); // focus stays on the node element
    await expect(node).toBeFocused();
    const flowPos = async () => {
      await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
      const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
      return flow.graph.nodes.find((n: { id: string }) => n.id === "normalise").position as { x: number; y: number };
    };
    const start = await flowPos();
    await page.keyboard.press("ArrowRight");
    const a = await flowPos();
    expect([a.x - start.x, a.y - start.y]).toEqual([12, 0]);
    await page.keyboard.press("Shift+ArrowDown");
    const b = await flowPos();
    expect([b.x - a.x, b.y - a.y]).toEqual([0, 1]);
  });

  test("opening and selecting does not mark the flow dirty or bump its revision", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    await page.locator('.react-flow__node[data-id="normalise"]').click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500); // longer than the 1s autosave debounce
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved");
    const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
    expect(flow.revision).toBe(1);
  });

  test("drawer tabs follow the WAI-ARIA keyboard pattern", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    await page.locator('.react-flow__node[data-id="normalise"]').click();
    const drawer = page.getByTestId("node-drawer");
    await drawer.getByRole("tab", { name: "Configure" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(drawer.getByRole("tab", { name: "Test" })).toHaveAttribute("aria-selected", "true");
    await expect(drawer.getByRole("tab", { name: "Test" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(drawer.getByRole("tab", { name: "Logs" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(drawer.getByRole("tab", { name: "Configure" })).toHaveAttribute("aria-selected", "true");
    // Hint text is announced with the field.
    await expect(drawer.getByLabel("Expression (JSONata)")).toHaveAccessibleDescription(/Evaluated against the upstream output/);
    // Arrow keys inside the tablist never nudge the node.
    const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
    expect(flow.revision).toBe(1);
  });

  test("invalid connections are refused with an explanation", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    const edgesBefore = await page.locator(".react-flow__edge").count();
    // Output → trigger is invalid (outputs have no outputs; triggers take no input). Try output of "normalise" into "trigger".
    const from = page.locator('.react-flow__node[data-id="normalise"] .react-flow__handle.source');
    const to = page.locator('.react-flow__node[data-id="is-hot"] .react-flow__handle.target');
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    // normalise → is-hot already exists: duplicate edge / second input is refused
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByText(/already has an input|already connected/)).toBeVisible();
    await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore);
    expect(await nodeIds(page)).toHaveLength(5);
  });

  test("re-run from a step reuses upstream outputs", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    await page.getByRole("button", { name: "▶ Run" }).click();
    const dock = page.getByTestId("run-dock");
    await expect(dock.getByText("SUCCESS").first()).toBeVisible({ timeout: 20_000 });
    await dock.getByRole("link", { name: /Open in inspector/ }).click();
    const panel = page.getByTestId("step-panel");
    await expect(page).toHaveURL(/\/runs\?run=/);
    await page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /50\+ employees\?/ }).click();
    await expect(panel.getByRole("heading")).toContainText("50+ employees?");
    await panel.getByRole("button", { name: /Re-run from this step/ }).click();
    const dialog = page.getByRole("dialog", { name: /Re-run #1 from/ });
    const preview = dialog.getByTestId("rerun-preview");
    await expect(preview).toContainText("Will run again · 3");
    await expect(preview).toContainText("Reused from #1 · 2");
    await dialog.getByRole("button", { name: /^Re-run 3 steps$/ }).click();
    await expect(page.getByText(/Re-running as #2/)).toBeVisible();
    await expect(page.getByRole("button", { name: /#2/ })).toBeVisible();
    await expect.poll(async () => {
      const runs = (await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs;
      return runs[0].status;
    }, { timeout: 15_000 }).toBe("succeeded");
    const runs = (await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs;
    const detail = (await (await page.request.get(`/api/runs/${runs[0].id}`)).json()).run;
    const statuses = Object.fromEntries(detail.steps.map((s: { nodeId: string; status: string }) => [s.nodeId, s.status]));
    expect(statuses).toMatchObject({ trigger: "reused", normalise: "reused", "is-hot": "succeeded", hot: "succeeded", nurture: "skipped" });
  });
});
