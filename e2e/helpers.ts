import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const PASSWORD = "e2e-Passw0rd!";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${randomUUID().slice(0, 8)}@flowline-e2e.test`;
}

/**
 * Fast setup for tests whose subject is NOT sign-up: creates the account,
 * workspace and (optionally) a template flow through the public API. The
 * cookie lands in the page's browser context. The full new-user journey is
 * covered through the UI in journey.spec.ts.
 */
export async function setupUser(page: Page, opts: { template?: string; workspace?: string } = {}) {
  const email = uniqueEmail();
  const req = page.request;
  const signUp = await req.post("/api/auth/sign-up/email", { data: { email, password: PASSWORD, name: "E2E User" } });
  expect(signUp.ok(), await signUp.text()).toBeTruthy();
  const ws = await (await req.post("/api/workspaces", { data: { name: opts.workspace ?? `E2E ${randomUUID().slice(0, 6)}` } })).json();
  expect((await req.post("/api/onboarding", { data: { goal: "sales", skipped: false } })).ok()).toBeTruthy();
  let flowId: string | undefined;
  if (opts.template) {
    const res = await req.post(`/api/workspaces/${ws.workspace.id}/flows`, { data: opts.template === "blank" ? { name: "Blank E2E" } : { templateId: opts.template } });
    flowId = (await res.json()).flow.id;
  }
  return { email, workspace: ws.workspace as { id: string; slug: string; name: string }, flowId };
}

export async function injectFault(req: APIRequestContext, kind: "save" | "load" | "run", count: number, status = 500) {
  const res = await req.post("/api/test/faults", { data: { kind, count, status } });
  expect(res.ok()).toBeTruthy();
}

export async function resetFaults(req: APIRequestContext) {
  await req.post("/api/test/faults", { data: { reset: true } });
}

export const node = (page: Page, id: string) => page.getByTestId(`node-${id}`);

export async function saveStatus(page: Page) {
  return page.getByTestId("save-status").getAttribute("data-status");
}

export async function expectSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
}

/** Drag from a node's output handle to another node's input handle with the real mouse. */
export async function connect(page: Page, fromNodeId: string, toNodeId: string, handle?: "true" | "false") {
  const from = handle
    ? page.locator(`.react-flow__node[data-id="${fromNodeId}"] .react-flow__handle.source[data-handleid="${handle}"]`)
    : page.locator(`.react-flow__node[data-id="${fromNodeId}"] .react-flow__handle.source`);
  const to = page.locator(`.react-flow__node[data-id="${toNodeId}"] .react-flow__handle.target`);
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

export async function nodeIds(page: Page) {
  return page.locator(".react-flow__node").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!));
}
