// Templates tile, 7 s (wide, full bleed): the Templates grid, the cursor hovers Lead Qualifier (its node-chain
// preview) at about 1.5x, uses it, and the canvas opens.
import { canvasReady, holdUntil, type Scenario } from "./common";

export const templates: Scenario = {
  id: "templates",
  start: (s) => `/w/${s.workspace.slug}/templates`,
  ready: async ({ page }) => {
    await page.getByTestId("template-lead-qualifier").waitFor({ state: "visible" });
  },
  async run(ctx) {
    const { page, rec, t } = ctx;
    const card = page.getByTestId("template-lead-qualifier");
    rec.beat("establish");
    await rec.hold(0.6);
    rec.beat("hover");
    await rec.hover(card, { at: [0.5, 0.2], dur: 0.8, focus: true, label: "lead-qualifier" });
    await rec.hold(1.4);
    await rec.click(card.getByRole("button", { name: t("templates.use") }), "use", { dur: 0.7, box: card });
    rec.beat("use");
    await canvasReady(page, 5);
    rec.beat("canvas");
    await holdUntil(ctx, 7.0);
  },
};
