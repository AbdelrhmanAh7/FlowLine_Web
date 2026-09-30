import { expect, test } from "@playwright/test";
import { expectSaved, nodeIds, setupUser } from "./helpers";

test.describe("canvas interactions & keyboard map", () => {
  test("select, duplicate, nudge, delete, undo/redo, Esc, and typing guards", { tag: "@critical" }, async ({ page }) => {
    const started=Date.now();
    const timing=(event:string)=>console.log(JSON.stringify({diagnostic:event,elapsedMs:Date.now()-started}));
    page.on('domcontentloaded',()=>timing('domcontentloaded'));
    page.on('load',()=>timing('load'));
    page.on('requestfailed',request=>timing('request-failed:'+request.resourceType()));
    page.on('response',response=>{if(response.request().isNavigationRequest())timing('document-response:'+response.status());});
    timing('setup-start');
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    timing('setup-complete');
    await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
    timing('navigation-complete');
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

});
