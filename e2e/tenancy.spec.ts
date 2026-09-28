import { expect, test } from "@playwright/test";
import { EN_STATE } from "../playwright.config";
import { setupUser } from "./helpers";

test("two users in separate workspaces cannot see each other's flows or runs", { tag: "@critical" }, async ({ browser }) => {
  const opts = { baseURL: "http://localhost:3100", extraHTTPHeaders: { origin: "http://localhost:3100" }, storageState: EN_STATE };
  const ctxA = await browser.newContext(opts);
  const ctxB = await browser.newContext(opts);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  const userA = await setupUser(a, { template: "lead-qualifier", workspace: "Tenant A" });
  const userB = await setupUser(b, { template: "order-totals", workspace: "Tenant B" });

  // A runs their flow so there is a run to (not) leak.
  const runA = (await (await a.request.post(`/api/flows/${userA.flowId}/runs`, { data: {} })).json()).run;
  await expect.poll(async () => (await (await a.request.get(`/api/runs/${runA.id}`)).json()).run.status, { timeout: 15_000 }).toBe("succeeded");

  // B's UI shows only B's flow and runs.
  await b.goto(`/w/${userB.workspace.slug}/flows`);
  await expect(b.getByRole("link", { name: "Order Totals Digest" })).toBeVisible();
  await expect(b.getByText("Lead Qualifier")).toHaveCount(0);
  await b.goto(`/w/${userB.workspace.slug}/runs`);
  await expect(b.getByText("No runs yet")).toBeVisible();

  // Direct URLs to A's workspace/flow/run are refused (404, no existence leak).
  const wsPage = await b.goto(`/w/${userA.workspace.slug}/flows`);
  expect(wsPage?.status()).toBe(404);
  await b.goto(`/w/${userB.workspace.slug}/flows/${userA.flowId}`);
  await expect(b.getByText("This flow doesn't exist")).toBeVisible();
  for (const url of [`/api/flows/${userA.flowId}`, `/api/runs/${runA.id}`, `/api/workspaces/${userA.workspace.id}/runs`, `/api/workspaces/${userA.workspace.id}/flows`, `/api/flows/${userA.flowId}/versions`]) {
    const res = await b.request.get(url);
    expect(res.status(), url).toBe(404);
  }
  expect((await b.request.put(`/api/flows/${userA.flowId}`, { data: { name: "pwned", baseRevision: 1 } })).status()).toBe(404);
  expect((await b.request.post(`/api/flows/${userA.flowId}/runs`, { data: {} })).status()).toBe(404);
  expect((await b.request.post(`/api/runs/${runA.id}/rerun`, { data: { fromNodeId: "is-hot" } })).status()).toBe(404);

  // A's data is untouched.
  const flowA = (await (await a.request.get(`/api/flows/${userA.flowId}`)).json()).flow;
  expect(flowA.name).toBe("Lead Qualifier");
  await ctxA.close();
  await ctxB.close();
});

test("unauthenticated API access is rejected and app routes redirect to sign-in", async ({ page }) => {
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign-out clears local drafts", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await page.evaluate(() => localStorage.setItem("flowline:draft:someone:flow", JSON.stringify({ x: 1 })));
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("complementary", { name: "Workspace navigation" }).getByRole("button", { name: /E2E User/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("flowline:draft:")).length)).toBe(0);
});
