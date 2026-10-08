// Hero loop, 16 s: idle Lead Qualifier canvas → Run → the steps light up (camera pans along the flow) → the run dock
// shows the result → back to the wide shot; the compositor dissolves the last 1.1 s into frame 0.
import { canvasReady, flowPath, grow, holdUntil, nodeCard, runButton, runFinished, type Scenario } from "./common";

/** Template node ids in run order (the canvas mirrors itself in Arabic, so the pan follows the reading direction). */
const ORDER = ["trigger", "normalise", "is-hot", "hot"];

export const hero: Scenario = {
  id: "hero",
  start: (s) => flowPath(s, s.flowId),
  ready: ({ page }) => canvasReady(page, 5),
  async run(ctx) {
    const { page, rec } = ctx;
    rec.beat("establish");
    await rec.hold(1.0);
    rec.beat("chip1");
    await rec.click(runButton(ctx), "run", { dur: 1.25 });
    rec.beat("run");
    // Pan along the flow while the steps light up (each target is a few nodes wide: about 1.4-1.5x).
    for (const id of ORDER) {
      const b = await rec.box(nodeCard(page, id));
      await rec.focus(grow(b, 400, 180), `node-${id}`);
      await holdUntil(ctx, rec.now() + 1.05);
    }
    const dock = await runFinished(ctx);
    rec.beat("results");
    const strip = await rec.box(dock);
    // The dock's run list + first steps, read at about 1.6x, then a slow drift out to 1.5x.
    const w = Math.min(strip.w, 360);
    const read = { x: ctx.locale === "ar" ? strip.x + strip.w - w : strip.x, y: strip.y, w, h: Math.min(strip.h, 130) };
    await rec.focus(read, "results");
    await rec.hover(dock.getByText("#1").first(), { dur: 0.8 });
    await holdUntil(ctx, rec.now() + 1.35);
    await rec.focus(grow(read, 380, 140), "results-drift");
    await holdUntil(ctx, rec.now() + 1.4);
    await rec.focus(grow(read, 400, 150), "results-drift");
    await holdUntil(ctx, 12.5);
    rec.beat("wide");
    await holdUntil(ctx, 16.0);
  },
};
