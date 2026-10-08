// History tile, 6 s (square, full bleed): open History, the versions list, open a version so "Restore as draft"
// appears and hover it. Destructive actions are never clicked.
import { canvasReady, flowPath, holdUntil, type Scenario } from "./common";

export const history: Scenario = {
  id: "history",
  start: (s) => flowPath(s, s.historyFlowId),
  ready: ({ page }) => canvasReady(page, 5),
  async run(ctx) {
    const { page, rec, t } = ctx;
    const button = page.getByTestId("builder").getByRole("button", { name: t("builder.history"), exact: true });
    // The square crop is centred between the History button and the panel it opens (mirrored in Arabic).
    const b = await rec.box(button);
    rec.setBase(Math.min(Math.max(b.x + b.w / 2, 360), 920), 360);
    rec.beat("establish");
    await rec.hold(0.4);
    await rec.click(button, "history", { dur: 0.7 });
    rec.beat("history");
    const panel = page.getByRole("dialog", { name: t("history.dialog") });
    const versions = panel.getByRole("list", { name: t("history.versions") });
    await versions.getByRole("button").first().waitFor({ state: "visible" });
    await rec.hold(0.5);
    await rec.click(versions.getByRole("button").first(), "version", { dur: 0.6, box: versions });
    rec.beat("version");
    const restore = page.getByTestId("version-detail").getByRole("button", { name: t("history.restoreDraft") });
    await rec.hover(restore, { dur: 0.6, focus: true, label: "restore" });
    rec.beat("restore");
    await holdUntil(ctx, 6.0);
  },
};
