// Shared scenario context. Scenarios find elements by role / test id / the app's own message text (src/i18n/messages),
// never by layout or CSS position, so a UI-only change re-records without script edits.
import ar from "../../../src/i18n/messages/ar.json";
import en from "../../../src/i18n/messages/en.json";
import type { Locator, Page } from "@playwright/test";
import type { Locale } from "../../../tools/demo-video/src/props";
import type { ClipId } from "../clips";
import type { Recorder } from "../kit";
import type { Seeded } from "../seed";

const MESSAGES: Record<Locale, unknown> = { ar, en };

/** The app's own UI string for `key` (dotted path) in `locale`; `{name}` placeholders are filled from `vars`. */
export function msg(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const v = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), MESSAGES[locale]);
  if (typeof v !== "string") throw new Error(`no ${locale} message "${key}"`);
  return v.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export type ScenarioCtx = {
  page: Page;
  rec: Recorder;
  locale: Locale;
  seeded: Seeded;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export type Scenario = {
  id: ClipId;
  /** Path the recording context opens (and waits on) before the first frame. */
  start: (s: Seeded) => string;
  /** Waits until the start page is ready to be filmed. */
  ready: (ctx: Omit<ScenarioCtx, "rec">) => Promise<void>;
  run: (ctx: ScenarioCtx) => Promise<void>;
};

export const flowPath = (s: Seeded, flowId: string) => `/w/${s.workspace.slug}/flows/${flowId}`;

/** The builder canvas has rendered its nodes. */
export async function canvasReady(page: Page, count?: number) {
  const nodes = page.locator(".react-flow__node");
  await nodes.first().waitFor({ state: "visible", timeout: 20_000 });
  if (count) await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length >= n, count);
}

/** A node card on the canvas by its id in the template graph. */
export const nodeCard = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

/** The toolbar Run button. */
export const runButton = (ctx: Pick<ScenarioCtx, "page" | "t">) => ctx.page.getByTestId("builder").getByRole("button", { name: ctx.t("builder.run"), exact: true });

/** Waits for the run dock header to report the finished run as succeeded. */
export async function runFinished(ctx: Pick<ScenarioCtx, "page" | "t">) {
  const dock = ctx.page.getByTestId("run-dock");
  await dock.getByText(ctx.t("runStatus.succeeded"), { exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
  return dock;
}

/** A box grown around `b` to at least w x h, keeping its centre (camera targets that should zoom less). */
export function grow(b: { x: number; y: number; w: number; h: number }, w: number, h: number) {
  const nw = Math.max(b.w, w);
  const nh = Math.max(b.h, h);
  return { x: b.x + b.w / 2 - nw / 2, y: b.y + b.h / 2 - nh / 2, w: nw, h: nh };
}

/** Recording seconds remaining until `t`, held as a deliberate beat (never negative). */
export async function holdUntil(ctx: Pick<ScenarioCtx, "rec">, t: number) {
  const left = t - ctx.rec.now();
  if (left > 0) await ctx.rec.hold(left);
}

export type { Locator };
