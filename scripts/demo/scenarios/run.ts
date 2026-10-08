// Run tile, 7 s (wide, full bleed): cursor to Run, the steps light up, the run dock shows the finished run and the
// run inspector opens.
import { canvasReady, flowPath, holdUntil, runButton, runFinished, type Scenario } from "./common";

export const run: Scenario = {
  id: "run",
  start: (s) => flowPath(s, s.flowId),
  ready: ({ page }) => canvasReady(page, 5),
  async run(ctx) {
    const { page, rec, t } = ctx;
    rec.beat("establish");
    await rec.hold(0.5);
    await rec.click(runButton(ctx), "run", { dur: 0.9 });
    rec.beat("run");
    const dock = await runFinished(ctx);
    rec.beat("finished");
    await rec.hold(0.6);
    await rec.click(dock.getByRole("link", { name: new RegExp(t("runDock.openInspector")) }), "inspector", { dur: 0.8 });
    await page.getByTestId("step-panel").waitFor({ state: "visible", timeout: 20_000 });
    rec.beat("inspector");
    await holdUntil(ctx, 7.0);
  },
};
