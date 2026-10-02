import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { FAKE_PROVIDER } from "./stack";

export const PASSWORD = "e2e-Passw0rd!";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${randomUUID().slice(0, 8)}@flowline-e2e.test`;
}

export interface OutboxMessage {
  subject: string;
  text: string;
  purpose: string | null;
  link: string | null;
}

/**
 * The test stack's "inbox" (test-only /api/test/outbox, backed by the outbox email provider): waits for the newest
 * message to `email` (optionally of one purpose, e.g. "verify") and returns it.
 */
export async function latestEmail(req: APIRequestContext, email: string, purpose?: string): Promise<OutboxMessage> {
  let found: OutboxMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`);
        expect(res.ok(), await res.text()).toBeTruthy();
        const { messages } = (await res.json()) as { messages: OutboxMessage[] };
        found = messages.find((m) => !purpose || m.purpose === purpose);
        return Boolean(found);
      },
      { timeout: 10_000, message: `no ${purpose ?? ""} email for ${email}` },
    )
    .toBe(true);
  return found!;
}

/** The verification link from the newest verification email to `email`. */
export async function verificationLink(req: APIRequestContext, email: string) {
  const link = (await latestEmail(req, email, "verify")).link;
  expect(link, "verification email carries a link").toMatch(/\/verify-email\?token=[A-Za-z0-9_-]{40,}/);
  return link!;
}

/**
 * Creates an account the way a person does — sign up, open the emailed verification link, confirm, sign in — but
 * through the HTTP API. Sign-up alone gives no session (email verification is required). The session cookie lands
 * in the request context (for `page.request`, the page's browser context).
 */
export async function signUpVerified(req: APIRequestContext, email: string, name = "E2E User") {
  const signUp = await req.post("/api/auth/sign-up/email", { data: { email, password: PASSWORD, name } });
  expect(signUp.ok(), await signUp.text()).toBeTruthy();
  expect((await signUp.json()).token, "sign-up must not sign in before verification").toBeNull();
  const token = new URL(await verificationLink(req, email)).searchParams.get("token");
  const verify = await req.post("/api/email", { data: { action: "verify", token } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  expect((await verify.json()).status).toBe("done");
  const signIn = await req.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } });
  expect(signIn.ok(), await signIn.text()).toBeTruthy();
}

/**
 * Fast setup for tests whose subject is NOT sign-up: creates (and verifies) the account, workspace and (optionally)
 * a template flow through the public API. The cookie lands in the page's browser context. The full new-user journey
 * is covered through the UI in journey.spec.ts.
 */
export async function setupUser(page: Page, opts: { template?: string; workspace?: string } = {}) {
  const email = uniqueEmail();
  const req = page.request;
  await signUpVerified(req, email);
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

export { FAKE_PROVIDER };

/**
 * A flow whose Sheets step is held by the fake provider ("delay": answers normally after delayMs, or
 * "timeout": hangs), so it stays "running" for a while: trigger → transform → sheets append → output.
 */
export async function setupStuckSheetsRun(req: APIRequestContext, workspaceId: string, opts: { mode?: "delay" | "timeout"; delayMs?: number } = {}) {
  const mode = opts.mode ?? "delay";
  const delayMs = opts.delayMs ?? 15_000;
  const conn = (
    await (
      await req.post(`/api/workspaces/${workspaceId}/connections`, { data: { provider: "google_sheets", label: "Sheets (e2e)", fields: { token: "test-token" } } })
    ).json()
  ).connection.id;
  const sheetId = `sheet-e2e-${randomUUID().slice(0, 8)}`;
  const flow = await (await req.post(`/api/workspaces/${workspaceId}/flows`, { data: { name: "Stuck sheets E2E" } })).json();
  const flowId = flow.flow.id as string;
  const pos = (i: number) => ({ x: 300 * i, y: 120 });
  const put = await req.put(`/api/flows/${flowId}`, {
    data: {
      baseRevision: 1,
      graph: {
        nodes: [
          { id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: '{ "name": "Ada" }' } } },
          { id: "norm", type: "transform.json", position: pos(1), data: { label: "Normalise", config: { expression: '{ "name": name }' } } },
          { id: "sheet", type: "integration.action", position: pos(2), data: { label: "Add row", config: { actionId: "google_sheets.append_row", connectionId: conn, inputMapping: `{ "spreadsheetId": "${sheetId}", "range": "A1", "row": [name] }`, requireApproval: false, retry: { maxAttempts: 5 } } } },
          { id: "o", type: "output", position: pos(3), data: { label: "Done", config: { key: "done", expression: "" } } },
        ],
        edges: [
          { id: "e0", source: "t", target: "norm", sourceHandle: null },
          { id: "e1", source: "norm", target: "sheet", sourceHandle: null },
          { id: "e2", source: "sheet", target: "o", sourceHandle: null },
        ],
      },
    },
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  await req.post(`${FAKE_PROVIDER}/__fake/fault`, { data: { provider: "google_sheets", pathPattern: sheetId, mode, times: 1000, delayMs } });
  const run = await (await req.post(`/api/flows/${flowId}/runs`, { data: { clientRequestId: randomUUID().replace(/-/g, "") } })).json();
  await expect
    .poll(
      async () => {
        const { run: r } = await (await req.get(`/api/runs/${run.run.id}`)).json();
        return r.steps.some((s: { nodeId: string; status: string }) => s.nodeId === "sheet" && s.status === "running");
      },
      { timeout: 20_000, message: "sheet step never entered running" },
    )
    .toBe(true);
  return { flowId, runId: run.run.id as string };
}

/**
 * Resets the WHOLE fake provider (state, request log, faults, OAuth clients). The fake is one process shared by every
 * Playwright worker, so this is only safe when nothing else is running against it; specs that merely leave their own run
 * behind should use cancelRunQuietly instead.
 */
export async function resetFakeProvider(req: APIRequestContext) {
  await req.post(`${FAKE_PROVIDER}/__fake/reset`);
}

/**
 * Cleanup for a run a test left "running" (e.g. one held by a fake-provider delay): asks for it to be cancelled
 * (the worker polls every second and aborts the in-flight step) and waits briefly for it to settle. Scoped to that one
 * run, so it is safe next to other workers using the shared fake. Best effort: it never throws (the run may already be
 * finished, which the API answers with 409, or the session may be gone).
 */
export async function cancelRunQuietly(req: APIRequestContext, runId: string | undefined) {
  if (!runId) return;
  try {
    await req.post(`/api/runs/${runId}/cancel`);
    await expect
      .poll(
        async () => {
          const { run } = await (await req.get(`/api/runs/${runId}`)).json();
          return run.status as string;
        },
        { timeout: 8_000, message: "run did not settle after cancel" },
      )
      .not.toMatch(/^(queued|running)$/);
  } catch {
    /* nothing left to clean up, or nothing we can do about it */
  }
}

export const FAKE_AI_MODEL = "fake-gpt-mini";

/**
 * Connects the OpenAI-compatible TEST DOUBLE (e2e/fakes/ai-server.ts, reached only because the test stack runs with
 * FLOWLINE_ENV=test) as this workspace's AI connection, through the same public API the settings page uses, and
 * makes it the default. For specs whose subject is NOT AI onboarding — the onboarding itself (key typed into the UI)
 * is covered by ai-hub.spec.ts. The double has no prices, so the owner allows unknown-cost calls explicitly.
 */
export async function connectAiApi(req: APIRequestContext, workspaceId: string, opts: { useRoles?: string[] } = {}) {
  const key = `sk-fake-e2e-${randomUUID().replace(/-/g, "")}`;
  const res = await req.post(`/api/workspaces/${workspaceId}/ai/connections`, { data: { provider: "openai", label: "Test double (OpenAI-compatible)", apiKey: key } });
  expect(res.status(), await res.text()).toBe(201);
  const { connection } = (await res.json()) as { connection: { id: string } };
  expect((await req.put(`/api/workspaces/${workspaceId}/ai/default-route`, { data: { route: { connectionId: connection.id, modelId: FAKE_AI_MODEL } } })).ok()).toBeTruthy();
  expect((await req.put(`/api/workspaces/${workspaceId}/ai/policy`, { data: { allowUnknownCost: true } })).ok()).toBeTruthy();
  if (opts.useRoles) expect((await req.patch(`/api/workspaces/${workspaceId}/ai/connections/${connection.id}`, { data: { useRoles: opts.useRoles } })).ok()).toBeTruthy();
  return connection;
}
