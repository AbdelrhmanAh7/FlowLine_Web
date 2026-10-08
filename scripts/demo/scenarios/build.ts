// Build tile, 8 s (square, full bleed): the empty canvas ("Start with a trigger"), the Add node palette, a search,
// two steps dragged onto the canvas and the edge between them connected.
import type { Page } from "@playwright/test";
import { holdUntil, type ScenarioCtx, type Scenario } from "./common";

/**
 * Opens the palette, optionally searches, and drags `title` onto the pane at fraction `at` of the pane (mirrored in RTL)
 * or at an absolute viewport point `opts.point`.
 */
export async function dropNode(ctx: ScenarioCtx, title: string, at: [number, number], opts: { search?: string; label: string; fast?: boolean; point?: [number, number] }) {
  const { page, rec, t } = ctx;
  await rec.click(page.getByRole("button", { name: t("builder.addNode") }).first(), `${opts.label}-palette`, { dur: opts.fast ? 0.45 : 0.55 });
  const palette = page.getByRole("dialog", { name: t("palette.dialog") });
  if (opts.search) await rec.type(palette.getByLabel(t("palette.searchLabel")), opts.search, `${opts.label}-search`, { delayMs: opts.fast ? 35 : 45, focused: true });
  const option = palette.getByRole("option", { name: new RegExp(title) }).first();
  const src = await rec.box(option);
  const pane = await rec.box(page.locator(".react-flow__pane"));
  const fx = ctx.locale === "ar" ? 1 - at[0] : at[0];
  const count = await page.locator(".react-flow__node").count();
  const to: [number, number] = opts.point ?? [pane.x + pane.w * fx, pane.y + pane.h * at[1]];
  await rec.drag([src.x + 40, src.y + src.h / 2], to, opts.label, { dur: opts.fast ? 0.6 : 0.75 });
  await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length > n, count);
  await page.keyboard.press("Escape"); // the new step's drawer opens; keep the canvas in view
}

/** Drags from one node's output handle to another node's input handle. */
export async function connectNodes(ctx: ScenarioCtx, from: string, to: string, label: string) {
  const { page, rec } = ctx;
  const a = await rec.box(handle(page, from, "source"));
  const b = await rec.box(handle(page, to, "target"));
  const before = await page.locator(".react-flow__edge").count();
  await rec.drag([a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w / 2, b.y + b.h / 2], label, { dur: 0.7 });
  await page.waitForFunction((n) => document.querySelectorAll(".react-flow__edge").length > n, before);
}

const handle = (page: Page, id: string, kind: "source" | "target") => page.locator(`.react-flow__node[data-id="${id}"] .react-flow__handle.${kind}`).first();

export const build: Scenario = {
  id: "build",
  start: (s) => `/w/${s.workspace.slug}/flows/${s.blankFlowId}`,
  ready: async ({ page, t }) => {
    await page.getByText(t("builder.emptyTitle")).first().waitFor({ state: "visible" });
  },
  async run(ctx) {
    const { page, rec, t } = ctx;
    // Square crop: centred on the span from the Add node button to the empty-state card (mirrored in Arabic).
    const add = await rec.box(page.getByRole("button", { name: t("builder.addNode") }).first());
    const empty = await rec.box(page.getByText(t("builder.emptyTitle")).first().locator("xpath=.."));
    rec.setBase((Math.min(add.x, empty.x) + Math.max(add.x + add.w, empty.x + empty.w)) / 2, 330);
    rec.beat("establish");
    await rec.hold(0.3);
    rec.beat("palette");
    await dropNode(ctx, t("nodes.trigger_manual.title"), [0.36, 0.45], { label: "trigger", fast: true });
    rec.beat("drop");
    // The second step lands one node-width further along the reading direction (the canvas may have re-centred).
    const first = await rec.box(page.locator(".react-flow__node").first());
    const dir = ctx.locale === "ar" ? -1 : 1;
    const point: [number, number] = [first.x + first.w / 2 + dir * (first.w + 90), first.y + first.h / 2];
    await dropNode(ctx, t("nodes.transform_json.title"), [0, 0], { search: "json", label: "transform", fast: true, point });
    const [a, b] = await page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!));
    rec.beat("connect");
    await connectNodes(ctx, a!, b!, "connect");
    await holdUntil(ctx, 8.0);
  },
};
