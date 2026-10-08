// Walkthrough, 53 s: four chapters (start from a template · shape the steps · run and watch · see what happened),
// then History and "Share copy" into the second workspace, then the end card. Captions are WebVTT, anchored to the
// beats logged here; the chapter cards are drawn by the compositor while the scenario holds.
import { WORKSPACES } from "../seed";
import { connectNodes, dropNode } from "./build";
import { canvasReady, grow, holdUntil, nodeCard, runButton, runFinished, type Scenario } from "./common";

export const walkthrough: Scenario = {
  id: "walkthrough",
  start: (s) => `/w/${s.workspace.slug}/templates`,
  ready: async ({ page }) => {
    await page.getByTestId("template-lead-qualifier").waitFor({ state: "visible" });
  },
  async run(ctx) {
    const { page, rec, t } = ctx;

    // 1 · Start from a template
    rec.beat("ch1");
    await holdUntil(ctx, 2.4);
    rec.beat("templates");
    const card = page.getByTestId("template-lead-qualifier");
    await rec.hover(card, { at: [0.5, 0.2], dur: 0.9, focus: true, label: "lead-qualifier" });
    await holdUntil(ctx, 5.6);
    await rec.click(card.getByRole("button", { name: t("templates.use") }), "use", { dur: 0.8, box: card });
    rec.beat("use");
    await canvasReady(page, 5);
    const flowUrl = page.url();
    await holdUntil(ctx, 12.0);

    // 2 · Shape the steps: add a condition below the flow, connect it after "Normalise lead", set its rule
    rec.beat("ch2");
    await holdUntil(ctx, 13.6);
    rec.beat("add-node");
    const before = await page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!));
    await dropNode(ctx, t("nodes.logic_condition.title"), [0.52, 0.8], { search: t("nodes.logic_condition.title").slice(0, 4), label: "condition" });
    const added = (await page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!))).find((id) => !before.includes(id))!;
    await holdUntil(ctx, 19.0);
    rec.beat("connect");
    await connectNodes(ctx, "normalise", added, "connect");
    await rec.click(nodeCard(page, added), "open-drawer", { dur: 0.6 });
    const drawer = page.getByTestId("node-drawer");
    await rec.type(drawer.getByLabel(t("config.condition.label")), "size >= 100", "condition", { clear: true });
    await page.keyboard.press("Escape"); // blur the field
    await page.keyboard.press("Escape"); // close the drawer
    await holdUntil(ctx, 25.0);

    // 3 · Run and watch
    rec.beat("ch3");
    await holdUntil(ctx, 26.6);
    rec.beat("run");
    await rec.click(runButton(ctx), "run", { dur: 0.9 });
    for (const id of ["trigger", "normalise", "is-hot", "hot"]) {
      await rec.focus(grow(await rec.box(nodeCard(page, id)), 400, 180), `node-${id}`);
      await holdUntil(ctx, rec.now() + 1.3);
    }
    const dock = await runFinished(ctx);
    await holdUntil(ctx, 33.0);
    rec.beat("result");
    await rec.focus(dock, "results");
    await holdUntil(ctx, 38.0);

    // 4 · See what happened: the run inspector, one step's input and output
    rec.beat("ch4");
    await holdUntil(ctx, 39.6);
    await rec.click(dock.getByRole("link", { name: new RegExp(t("runDock.openInspector")) }), "inspector", { dur: 0.7 });
    rec.beat("inspect");
    const panel = page.getByTestId("step-panel");
    await panel.waitFor({ state: "visible", timeout: 20_000 });
    // "50+ employees?" reads the normalised lead (no email in its input or output).
    await rec.click(page.getByRole("button", { name: t("localTemplates.lead-qualifier.nodes.is-hot") }).first(), "step", { dur: 0.6 });
    await rec.click(panel.getByRole("tab", { name: t("runs.panel.tabs.input") }), "tab-input", { dur: 0.5, box: panel });
    await rec.hold(1.0);
    await rec.click(panel.getByRole("tab", { name: t("runs.panel.tabs.output") }), "tab-output", { dur: 0.4, box: panel });
    await holdUntil(ctx, 44.0);

    // History (runs and versions), then a copy into the second workspace
    await page.goto(flowUrl);
    rec.beat("history");
    await canvasReady(page, 6);
    const history = page.getByTestId("builder").getByRole("button", { name: t("builder.history"), exact: true });
    await rec.click(history, "history", { dur: 0.6 });
    const versions = page.getByRole("dialog", { name: t("history.dialog") });
    await versions.waitFor({ state: "visible" });
    await rec.focus(versions, "versions");
    await holdUntil(ctx, 47.3);
    rec.beat("share");
    const target = versions.locator("#share-target");
    await rec.click(target, "share-target", { dur: 0.5 });
    await target.selectOption({ label: WORKSPACES[ctx.locale][1] });
    await rec.click(versions.getByRole("button", { name: t("history.share") }), "share", { dur: 0.5 });
    await page.getByText(t("history.copied")).first().waitFor({ state: "visible", timeout: 15_000 });
    await holdUntil(ctx, 50.4);
    rec.beat("end");
    await holdUntil(ctx, 53.0);
  },
};
