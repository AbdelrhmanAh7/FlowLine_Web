import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { injectFault, resetFaults, setupUser } from "./helpers";

const OUT = "artifacts/phase-2/screenshots";
mkdirSync(OUT, { recursive: true });

async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, "page must not scroll horizontally").toBeLessThanOrEqual(iw);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350); // let 250ms drawer/fade transitions settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** Seeds a flow with one succeeded and one failed run so screens show populated states. */
async function seeded(page: Page) {
  const u = await setupUser(page, { template: "lead-qualifier", workspace: "Acme Workspace" });
  const ok = (await (await page.request.post(`/api/flows/${u.flowId}/runs`, { data: {} })).json()).run;
  await expect.poll(async () => (await (await page.request.get(`/api/runs/${ok.id}`)).json()).run.status, { timeout: 15_000 }).toBe("succeeded");
  const broken = (await (await page.request.post(`/api/workspaces/${u.workspace.id}/flows`, { data: { templateId: "order-totals" } })).json()).flow;
  const full = (await (await page.request.get(`/api/flows/${broken.id}`)).json()).flow;
  full.graph.nodes.find((n: { id: string }) => n.id === "sum").data.config.expression = "$sum(items.(qty * price)) + $number(\"n/a\")";
  await page.request.put(`/api/flows/${broken.id}`, { data: { graph: full.graph, name: "Order Totals (broken)", baseRevision: full.revision } });
  const bad = (await (await page.request.post(`/api/flows/${broken.id}/runs`, { data: {} })).json()).run;
  await expect.poll(async () => (await (await page.request.get(`/api/runs/${bad.id}`)).json()).run.status, { timeout: 15_000 }).not.toMatch(/queued|running/);
  return { ...u, okRunId: ok.id, badRunId: bad.id };
}

test.describe("breakpoints", () => {
  for (const [w, expectSidebar] of [
    [1440, 240],
    [1280, 240],
    [1279, 48],
    [1024, 48],
    [768, 48],
    [767, 0],
    [375, 0],
  ] as const) {
    test(`shell at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      const u = await setupUser(page, { template: "lead-qualifier" });
      await page.goto(`/w/${u.workspace.slug}/flows`);
      const aside = page.locator("aside[aria-label='Workspace navigation']").first();
      if (expectSidebar === 0) {
        await expect(aside).toBeHidden();
        await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
      } else {
        await expect.poll(async () => Math.round((await aside.boundingBox())!.width)).toBe(expectSidebar);
      }
      await noHorizontalScroll(page);
    });
  }
});

test("builder drawer: 360px at desktop, overlay + scrim on tablet, bottom sheet on mobile", async ({ page }) => {
  const u = await setupUser(page, { template: "lead-qualifier" });
  for (const [w, h] of [
    [1440, 900],
    [1024, 768],
    [375, 812],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/w/${u.workspace.slug}/flows/${u.flowId}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    await page.locator('.react-flow__node[data-id="normalise"]').click();
    const drawer = page.getByTestId("node-drawer");
    await expect(drawer).toBeVisible();
    const box = (await drawer.boundingBox())!;
    if (w >= 768) expect(Math.round(box.width)).toBe(360);
    else expect(box.height).toBeGreaterThan(h * 0.85);
    if (w === 1024) {
      await expect(page.getByRole("button", { name: "Close drawer", exact: true })).toBeVisible(); // scrim
      // Swipe the drawer header to the right to dismiss it.
      const header = drawer.getByRole("heading").first();
      const hb = (await header.boundingBox())!;
      await page.mouse.move(hb.x + 20, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(hb.x + 160, hb.y + hb.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(drawer).toHaveCount(0);
      await page.locator('.react-flow__node[data-id="normalise"]').click();
      await expect(drawer).toBeVisible();
    }
    await noHorizontalScroll(page);
  }
});

test("mobile is monitor-only: editing disabled with a persistent banner, running still works", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const u = await setupUser(page, { template: "lead-qualifier" });
  await page.goto(`/w/${u.workspace.slug}/flows/${u.flowId}`);
  await expect(page.getByText("Editing is disabled on mobile")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add node/ })).toHaveCount(0);
  const node = page.locator('.react-flow__node[data-id="normalise"]');
  const other = page.locator('.react-flow__node[data-id="trigger"]');
  // Dragging a node only pans the view on mobile: its position relative to other nodes is unchanged.
  const rel = async () => {
    const a = (await node.boundingBox())!;
    const b = (await other.boundingBox())!;
    return Math.round(a.x - b.x) + Math.round(a.y - b.y);
  };
  const before = await node.boundingBox();
  const relBefore = await rel();
  await page.mouse.move(before!.x + 20, before!.y + 20);
  await page.mouse.down();
  await page.mouse.move(before!.x + 120, before!.y + 80, { steps: 6 });
  await page.mouse.up();
  expect(await rel()).toBe(relBefore);
  const { flow } = await (await page.request.get(`/api/flows/${u.flowId}`)).json();
  expect(flow.revision).toBe(1);
  await node.click();
  await expect(page.getByTestId("node-drawer").getByLabel("Name")).toBeDisabled();
  await page.getByRole("button", { name: "Close drawer (Esc)" }).click();
  await page.getByRole("button", { name: "▶ Run" }).click();
  await expect(page.getByTestId("run-dock").getByText("SUCCESS").first()).toBeVisible({ timeout: 20_000 });
  await noHorizontalScroll(page);
  await shot(page, "builder-mobile-monitor-375");
});

test("capture screens & states at 1440 / 1024 / 375", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const u = await seeded(page);
  const sizes = [
    ["1440", 1440, 900],
    ["1024", 1024, 768],
    ["375", 375, 812],
  ] as const;

  for (const [label, w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/w/${u.workspace.slug}/flows`);
    await expect(page.getByText("Lead Qualifier").first()).toBeVisible();
    await shot(page, `dashboard-populated-${label}`);

    await page.goto(`/w/${u.workspace.slug}/flows/${u.flowId}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    if (w >= 768) {
      await page.keyboard.press("Control+j");
      await expect(page.getByTestId("run-dock").getByText("SUCCESS").first()).toBeVisible();
    }
    await page.locator('.react-flow__node[data-id="normalise"]').click();
    await shot(page, `builder-selected-${label}`);

    await page.goto(`/w/${u.workspace.slug}/runs?run=${u.badRunId}`);
    await expect(page.getByTestId("step-panel").first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Runs" })).toBeVisible();
    await expect(page.getByTestId("step-panel").first()).toContainText(/failed/i);
    await shot(page, `run-inspector-failed-${label}`);

    for (const p of ["integrations", "templates", "settings"]) {
      await page.goto(`/w/${u.workspace.slug}/${p}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      await noHorizontalScroll(page);
      await shot(page, `${p}-${label}`);
    }
  }

  // Public pages (fresh, signed-out context)
  const anon = await browser.newContext({ baseURL: "http://localhost:3100" });
  const ap = await anon.newPage();
  for (const [label, w, h] of sizes) {
    await ap.setViewportSize({ width: w, height: h });
    await ap.goto("/");
    await noHorizontalScroll(ap);
    await shot(ap, `landing-${label}`);
    await ap.goto("/sign-up");
    await shot(ap, `auth-signup-${label}`);
  }
  await anon.close();

  // Onboarding step 2 (goal) for a new account
  const fresh = await browser.newContext({ baseURL: "http://localhost:3100", extraHTTPHeaders: { origin: "http://localhost:3100" } });
  const fp = await fresh.newPage();
  await fp.request.post("/api/auth/sign-up/email", { data: { email: `onb-${Date.now()}@flowline-e2e.test`, password: "e2e-Passw0rd!", name: "Jules Kim" } });
  await fp.setViewportSize({ width: 1440, height: 900 });
  await fp.goto("/onboarding");
  await fp.getByRole("button", { name: "Continue" }).click();
  await fp.getByRole("radio", { name: /Sales & lead ops/ }).click();
  await shot(fp, "onboarding-goal-1440");
  await fresh.close();

  // States at 1440
  await page.setViewportSize({ width: 1440, height: 900 });
  // Loading: hold the flow request so the skeleton is visible (network delay only; data is real).
  await page.route("**/api/flows/*", async (route) => {
    if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  });
  const nav = page.goto(`/w/${u.workspace.slug}/flows/${u.flowId}`);
  await expect(page.locator('[aria-busy="true"][aria-label="Loading flow"]')).toBeVisible();
  await shot(page, "state-loading-builder-1440");
  await nav;
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.goto("about:blank");

  // Error: injected load failures (test env only) exhaust the 1s/2s/4s retries.
  await injectFault(page.request, "load", 4);
  await page.goto(`/w/${u.workspace.slug}/flows/${u.flowId}`);
  await expect(page.getByText("Couldn't load this flow")).toBeVisible({ timeout: 20_000 });
  await shot(page, "state-error-load-1440");
  await resetFaults(page.request);

  // Offline
  await page.goto(`/w/${u.workspace.slug}/flows/${u.flowId}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.context().setOffline(true);
  await page.getByLabel("Flow name").fill("Lead Qualifier (offline edit)");
  await expect(page.getByText("Offline mode")).toBeVisible();
  await shot(page, "state-offline-builder-1440");
  await page.context().setOffline(false);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });

  // Empty states — a second, brand-new account (switches this context's session).
  const empty = await setupUser(page, { template: "blank" });
  await page.goto(`/w/${empty.workspace.slug}/flows/${empty.flowId}`);
  await expect(page.getByText("Start with a trigger")).toBeVisible();
  await shot(page, "state-empty-canvas-1440");

  await page.goto(`/w/${empty.workspace.slug}/runs?q=zzz-no-match`);
  await expect(page.getByText("No runs")).toBeVisible();
  await shot(page, "state-empty-runs-1440");

});
