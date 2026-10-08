// Seeds one demo account per recording through the e2e helpers (sign-up, outbox verification, sign-in, onboarding)
// in a setup context that carries the test-only `fl_test_beta_mode=open` cookie, then saves its storageState so the
// recording context starts signed in. Sample data only: the account lives on @flowline-demo.test and the workspaces
// carry the localized demo names (two of them, so "Share copy" has a target).
import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import type { Locale } from "../../tools/demo-video/src/props";

export const WORKSPACES: Record<Locale, [string, string]> = { ar: ["شركة العرض", "عمليات العرض"], en: ["Demo Co", "Demo Co Ops"] };
const USER_NAME: Record<Locale, string> = { ar: "فريق العرض", en: "Demo Team" };

export type Seeded = {
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  workspace: { id: string; slug: string };
  second: { id: string; slug: string };
  /** Lead Qualifier flow, idle, never run. */
  flowId: string;
  /** Lead Qualifier flow with a few saved versions (history clip). */
  historyFlowId: string;
  /** Blank flow (empty canvas). */
  blankFlowId: string;
};

/**
 * A fresh account per recording, so every clip starts from the same state (the first run is "Run #1"). `history`
 * adds two finished runs (two saved versions) to `historyFlowId`; the other flows are always created (cheap).
 */
export async function seed(browser: Browser, url: string, locale: Locale, opts: { history?: boolean } = {}): Promise<Seeded> {
  // e2e/helpers.ts reads the stack at import time; its STACK must describe the demo stack.
  const { signUpVerified } = await import("../../e2e/helpers");
  const ctx = await browser.newContext({ baseURL: url, extraHTTPHeaders: { origin: new URL(url).origin } });
  try {
    await ctx.addCookies([
      { name: "fl_test_beta_mode", value: "open", url },
      { name: "fl_locale", value: locale, url },
    ]);
    const req = ctx.request;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API JSON, checked by use
    const ok = async (res: Awaited<ReturnType<typeof req.post>>, what: string): Promise<any> => {
      if (!res.ok()) throw new Error(`seed ${what}: ${res.status()} ${await res.text()}`);
      return res.json();
    };
    const email = `demo-${locale}-${randomUUID().slice(0, 8)}@flowline-demo.test`;
    await signUpVerified(req, email, USER_NAME[locale]);
    const [a, b] = WORKSPACES[locale];
    const ws = (await ok(await req.post("/api/workspaces", { data: { name: a } }), "workspace")).workspace;
    const second = (await ok(await req.post("/api/workspaces", { data: { name: b } }), "second workspace")).workspace;
    await ok(await req.post("/api/onboarding", { data: { goal: "sales", skipped: false } }), "onboarding");
    const lead = async () => (await ok(await req.post(`/api/workspaces/${ws.id}/flows`, { data: { templateId: "lead-qualifier" } }), "flow")).flow.id as string;
    const flowId = await lead();
    const historyFlowId = await lead();
    // Two runs leave two "run" versions behind, so the history list has something to restore.
    for (let i = 0; i < (opts.history ? 2 : 0); i++) {
      const run = (await ok(await req.post(`/api/flows/${historyFlowId}/runs`, { data: { clientRequestId: randomUUID().replace(/-/g, "") } }), "run")).run;
      for (let n = 0; n < 60; n++) {
        const { run: r } = await ok(await req.get(`/api/runs/${run.id}`), "run status");
        if (!/^(queued|running)$/.test(r.status)) break;
        await new Promise((res) => setTimeout(res, 250));
      }
    }
    const blankFlowId = (await ok(await req.post(`/api/workspaces/${ws.id}/flows`, { data: { name: locale === "ar" ? "سير عمل جديد" : "New flow" } }), "blank flow")).flow.id as string;
    return { storageState: await ctx.storageState(), workspace: ws, second, flowId, historyFlowId, blankFlowId };
  } finally {
    await ctx.close();
  }
}
