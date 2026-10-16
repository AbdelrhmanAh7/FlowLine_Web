# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas.spec.ts >> canvas interactions & keyboard map >> select, duplicate, nudge, delete, undo/redo, Esc, and typing guards
- Location: e2e/canvas.spec.ts:5:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.goto: Test timeout of 60000ms exceeded.
Call log:
  - navigating to "http://localhost:3100/w/e2e-a88267/flows/74956a23-2abf-4846-91c9-8df6b6b32781", waiting until "load"

```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { expectSaved, nodeIds, setupUser } from "./helpers";
  3   | 
  4   | test.describe("canvas interactions & keyboard map", () => {
  5   |   test("select, duplicate, nudge, delete, undo/redo, Esc, and typing guards", { tag: "@critical" }, async ({ page }) => {
  6   |     const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
> 7   |     await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
      |                ^ Error: page.goto: Test timeout of 60000ms exceeded.
  8   |     await expect(page.locator(".react-flow__node")).toHaveCount(5);
  9   | 
  10  |     // Select → drawer opens; Esc closes and deselects.
  11  |     const transform = page.locator('.react-flow__node[data-id="normalise"]');
  12  |     await transform.click();
  13  |     const drawer = page.getByTestId("node-drawer");
  14  |     await expect(drawer).toBeVisible();
  15  |     await page.keyboard.press("Escape");
  16  |     await expect(drawer).toHaveCount(0);
  17  | 
  18  |     // Typing guard: Delete/Backspace inside a drawer field must not delete the node, Ctrl+Enter must not run.
  19  |     await transform.click();
  20  |     const nameField = drawer.getByLabel("Name");
  21  |     await nameField.click();
  22  |     await nameField.press("End");
  23  |     await nameField.press("Backspace");
  24  |     await nameField.press("Delete");
  25  |     await nameField.press("Control+Enter");
  26  |     await expect(page.locator(".react-flow__node")).toHaveCount(5);
  27  |     await expect(page.getByTestId("run-dock")).toHaveCount(0);
  28  |     await expect(nameField).toHaveValue("Normalise lea");
  29  | 
  30  |     // Arrow nudge = 12px (Shift = 1px) while the canvas has focus.
  31  |     await page.keyboard.press("Escape"); // blur field
  32  |     const before = await transform.boundingBox();
  33  |     await page.keyboard.press("ArrowRight");
  34  |     await page.keyboard.press("Shift+ArrowDown");
  35  |     // Screen delta = flow delta × zoom, so read the zoom from the viewport transform.
  36  |     const zoom = await page.locator(".react-flow__viewport").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  37  |     await expect.poll(async () => Math.round(((await transform.boundingBox())!.x - before!.x) / zoom)).toBe(12);
  38  |     expect(Math.round(((await transform.boundingBox())!.y - before!.y) / zoom)).toBe(1);
  39  | 
  40  |     // Ctrl+D duplicates the selection.
  41  |     await page.keyboard.press("Control+d");
  42  |     await expect(page.locator(".react-flow__node")).toHaveCount(6);
  43  |     await expect(page.locator(".react-flow__node").filter({ hasText: "Normalise lea copy" })).toHaveCount(1);
  44  | 
  45  |     // Delete removes the selected duplicate; Ctrl+Z restores it; Ctrl+Shift+Z re-applies.
  46  |     await page.keyboard.press("Delete");
  47  |     await expect(page.locator(".react-flow__node")).toHaveCount(5);
  48  |     await page.keyboard.press("Control+z");
  49  |     await expect(page.locator(".react-flow__node")).toHaveCount(6);
  50  |     await page.keyboard.press("Control+Shift+z");
  51  |     await expect(page.locator(".react-flow__node")).toHaveCount(5);
  52  | 
  53  |     // Trigger can't be duplicated (only one per flow) — explained, not silently ignored.
  54  |     await page.locator('.react-flow__node[data-id="trigger"]').click();
  55  |     await page.keyboard.press("Escape");
  56  |     await page.locator('.react-flow__node[data-id="trigger"]').click();
  57  |     await page.keyboard.press("Control+d");
  58  |     await expect(page.getByRole("status").filter({ hasText: "A flow can only have one trigger" })).toBeVisible();
  59  | 
  60  |     // Ctrl+0 fits, zoom controls work, Ctrl+J toggles the run dock.
  61  |     await page.getByRole("button", { name: "Zoom in" }).click();
  62  |     await page.keyboard.press("Control+0");
  63  |     await page.keyboard.press("Control+j");
  64  |     await expect(page.getByTestId("run-dock")).toBeVisible();
  65  |     await page.keyboard.press("Control+j");
  66  |     await expect(page.getByTestId("run-dock")).toHaveCount(0);
  67  | 
  68  |     // "/" opens node search, focused.
  69  |     await page.keyboard.press("Escape");
  70  |     await page.keyboard.press("/");
  71  |     await expect(page.getByRole("textbox", { name: "Search nodes" })).toBeFocused();
  72  |     await page.keyboard.type("cond");
  73  |     await expect(page.getByRole("option")).toHaveCount(1);
  74  |     await page.keyboard.press("Escape");
  75  | 
  76  |     await expectSaved(page);
  77  |     const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
  78  |     expect(flow.graph.nodes.find((n: { id: string }) => n.id === "normalise").data.label).toBe("Normalise lea");
  79  |   });
  80  | 
  81  |   test("arrow nudge is exactly 12px (Shift 1px) when the node itself has focus (regression: Codex CR-01)", async ({ page }) => {
  82  |     const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  83  |     await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  84  |     const node = page.locator('.react-flow__node[data-id="normalise"]');
  85  |     await node.click(); // focus stays on the node element
  86  |     await expect(node).toBeFocused();
  87  |     const flowPos = async () => {
  88  |       await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  89  |       const { flow } = await (await page.request.get(`/api/flows/${flowId}`)).json();
  90  |       return flow.graph.nodes.find((n: { id: string }) => n.id === "normalise").position as { x: number; y: number };
  91  |     };
  92  |     const start = await flowPos();
  93  |     await page.keyboard.press("ArrowRight");
  94  |     const a = await flowPos();
  95  |     expect([a.x - start.x, a.y - start.y]).toEqual([12, 0]);
  96  |     await page.keyboard.press("Shift+ArrowDown");
  97  |     const b = await flowPos();
  98  |     expect([b.x - a.x, b.y - a.y]).toEqual([0, 1]);
  99  |   });
  100 | 
  101 |   test("opening and selecting does not mark the flow dirty or bump its revision", async ({ page }) => {
  102 |     const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  103 |     await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  104 |     await expect(page.locator(".react-flow__node")).toHaveCount(5);
  105 |     await page.locator('.react-flow__node[data-id="normalise"]').click();
  106 |     await page.keyboard.press("Escape");
  107 |     await page.waitForTimeout(2500); // longer than the 1s autosave debounce
```