import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { BASE_URL, EN_STATE } from "../playwright.config";
import { connectAiApi, setupUser, signUpVerified, uniqueEmail } from "./helpers";

/**
 * Phase 3 journeys through the real UI. Provider boundary only is doubled (fake SaaS :4010, fake AI :4011
 * incl. its Copilot/agent modes, fake Stripe checkout). Every test uses its own users and workspaces.
 */
const FAKE = process.env.FLOWLINE_PROVIDER_OVERRIDE ?? "http://127.0.0.1:4010";

async function newUserContext(browser: Browser, email = uniqueEmail("p3")) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL }, storageState: EN_STATE });
  const page = await ctx.newPage();
  await signUpVerified(page.request, email, "Invitee");
  return { ctx, page, email };
}
async function saveGraph(req: APIRequestContext, flowId: string, graph: unknown) {
  const res = await req.put(`/api/flows/${flowId}`, { data: { baseRevision: 1, graph } });
  expect(res.ok(), await res.text()).toBeTruthy();
}
const pos = (i: number) => ({ x: 300 * i, y: 120 });
const manual = (payload = '{ "name": "Ada" }') => ({ id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: payload } } });
const out = (i: number) => ({ id: "o", type: "output", position: pos(i), data: { label: "Done", config: { key: "done", expression: "" } } });
const line = (...ids: string[]) => ids.slice(1).map((id, i) => ({ id: `e${i}`, source: ids[i]!, target: id, sourceHandle: null }));

async function slackApprovalFlow(page: Page, workspaceId: string, channel: string) {
  const conn = await page.request.post(`/api/workspaces/${workspaceId}/connections`, { data: { provider: "slack", label: "Slack (e2e)", fields: { token: "test-token" } } });
  const connId = (await conn.json()).connection.id as string;
  const flowId = (await (await page.request.post(`/api/workspaces/${workspaceId}/flows`, { data: { name: "Needs approval" } })).json()).flow.id as string;
  await saveGraph(page.request, flowId, {
    nodes: [
      manual(),
      { id: "post", type: "integration.action", position: pos(1), data: { label: "Post to Slack", config: { actionId: "slack.post_message", connectionId: connId, inputMapping: `{ "channel": "${channel}", "text": "Hi " & name }`, requireApproval: true, retry: { maxAttempts: 1 } } } },
      out(2),
    ],
    edges: line("t", "post", "o"),
  });
  return flowId;
}

test("members: invite link → accept; a VIEWER can see but not approve (UI + API); promotion allows it; removal revokes access", { tag: "@critical" }, async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { workspace } = await setupUser(page);
  const invitee = uniqueEmail("viewer");
  await page.goto(`/w/${workspace.slug}/settings`);
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!.trim();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);

  // The viewer joins through the link.
  const v = await newUserContext(browser, invitee);
  await v.page.goto(new URL(link).pathname);
  await expect(v.page.getByText(/invited to/)).toContainText(/as viewer/i);
  await v.page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(v.page).toHaveURL(new RegExp(`/w/${workspace.slug}/flows`));

  // Owner triggers an approval-gated action.
  const channel = `C_P3_${randomUUID().slice(0, 8)}`;
  const flowId = await slackApprovalFlow(page, workspace.id, channel);
  const run = await page.request.post(`/api/flows/${flowId}/runs`, { data: {} });
  const runId = (await run.json()).run.id as string;
  await expect.poll(async () => (await (await page.request.get(`/api/runs/${runId}`)).json()).run.status, { timeout: 20_000 }).toBe("waiting_approval");

  // The viewer sees the request in the inspector, but can't decide it — in the UI or via the API.
  await v.page.goto(`/w/${workspace.slug}/runs?run=${runId}`);
  await v.page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Post to Slack/ }).click();
  const box = v.page.getByTestId("decision-box");
  await expect(box).toContainText(channel);
  const approve = box.getByRole("button", { name: "Approve" });
  await expect(approve).toHaveAttribute("aria-disabled", "true");
  await expect(approve).toHaveAccessibleDescription(/Only workspace owners and editors/);
  const approvals = (await (await page.request.get(`/api/workspaces/${workspace.id}/approvals`)).json()).approvals as { id: string }[];
  const direct = await v.page.request.post(`/api/approvals/${approvals[0]!.id}/decide`, { data: { decision: "approve" } });
  expect(direct.status()).toBe(403);
  expect((await (await page.request.get(`/api/runs/${runId}`)).json()).run.status).toBe("waiting_approval");

  // Promote to editor → now allowed.
  await page.goto(`/w/${workspace.slug}/settings`);
  await page.getByLabel(`Role of ${invitee}`).selectOption("editor");
  await expect(page.getByRole("status").filter({ hasText: "Role updated" })).toBeVisible();
  await v.page.reload();
  await v.page.getByRole("list", { name: "Runs" }).getByRole("button", { name: /Post to Slack/ }).click();
  await v.page.getByTestId("decision-box").getByRole("button", { name: "Approve" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/runs/${runId}`)).json()).run.status, { timeout: 20_000 }).toBe("succeeded");

  // Removal takes effect on the next request.
  await page.getByTestId(`member-${invitee}`).getByRole("button", { name: "Remove" }).click();
  await page.getByTestId(`member-${invitee}`).getByRole("button", { name: "Confirm remove" }).click();
  await expect(page.getByTestId(`member-${invitee}`)).toHaveCount(0);
  expect((await v.page.request.get(`/api/workspaces/${workspace.id}/flows`)).status()).toBe(404);
  await v.ctx.close();

  // Audit trail.
  await page.getByRole("button", { name: "Audit log" }).click();
  const audit = page.getByRole("list", { name: "Audit events" });
  for (const a of ["member.invited", "member.joined", "approval.decided", "member.role_changed", "member.removed"]) await expect(audit).toContainText(a);
});

test("API keys: created with a one-time reveal, work against /api/v1, stop working when revoked", { tag: "@critical" }, async ({ page }) => {
  const { workspace } = await setupUser(page, { template: "lead-qualifier" });
  await page.goto(`/w/${workspace.slug}/settings?tab=keys`);
  await page.getByLabel("Name").fill("CI");
  await page.getByRole("button", { name: "Create key" }).click();
  const key = (await page.getByTestId("revealed-key").textContent())!.trim();
  expect(key).toMatch(/^fl_test_[a-z0-9]{8}_/);
  const call = () => page.request.get("/api/v1/flows", { headers: { authorization: `Bearer ${key}` } });
  // Needs flows:read — the default scopes are runs:write + runs:read.
  expect((await call()).status()).toBe(403);
  const runs = await page.request.post(`/api/v1/flows/${(await (await page.request.get(`/api/workspaces/${workspace.id}/flows`)).json()).flows[0].id}/runs`, { headers: { authorization: `Bearer ${key}` }, data: { input: {} } });
  expect(runs.status()).toBe(202);
  await page.getByRole("button", { name: "I've stored it" }).click();
  await expect(page.getByTestId("revealed-key")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(key)).toHaveCount(0); // never shown again
  await page.getByTestId("apikey-CI").getByRole("button", { name: "Revoke" }).click();
  await page.getByTestId("apikey-CI").getByRole("button", { name: "Confirm revoke" }).click();
  await expect(page.getByTestId("apikey-CI")).toContainText("revoked");
  const after = await page.request.post(`/api/v1/flows/${(await (await page.request.get(`/api/workspaces/${workspace.id}/flows`)).json()).flows[0].id}/runs`, { headers: { authorization: `Bearer ${key}` }, data: {} });
  expect(after.status()).toBe(401);
});

test("knowledge + agent: upload, index, cite; ASK tool pauses for approval and runs the published workflow once", { tag: "@critical" }, async ({ page }) => {
  test.setTimeout(150_000);
  const { workspace } = await setupUser(page);
  await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
  // A published workflow the agent may run.
  const flowId = (await (await page.request.post(`/api/workspaces/${workspace.id}/flows`, { data: { name: "Doubler" } })).json()).flow.id as string;
  await saveGraph(page.request, flowId, {
    nodes: [manual('{ "n": 1 }'), { id: "x", type: "transform.json", position: pos(1), data: { label: "Double", config: { expression: '{ "v": n * 2 }' } } }, out(2)],
    edges: line("t", "x", "o"),
  });
  expect((await page.request.post(`/api/flows/${flowId}/publish`)).status()).toBe(201);

  await page.goto(`/w/${workspace.slug}/knowledge`);
  await page.getByLabel("Title").fill("Refund policy");
  await page.getByLabel("Text").fill("Refunds are available within 30 days of purchase.");
  await page.getByRole("button", { name: "Add text" }).click();
  await expect(page.getByTestId("source-Refund policy")).toContainText("ready", { timeout: 20_000 });

  await page.goto(`/w/${workspace.slug}/agents`);
  await page.getByRole("link", { name: "New agent" }).first().click();
  await page.getByLabel("Name").fill("Support bot");
  await page.getByLabel("Instructions").fill("Answer from knowledge; run the Doubler when asked.");
  await page.getByRole("list", { name: "Knowledge sources" }).getByLabel(/Refund policy/).check();
  await page.getByRole("list", { name: "Workflow tools" }).getByLabel(/Doubler/).check(); // defaults to ASK
  await page.getByRole("button", { name: "Create agent" }).click();
  await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}$/);

  await page.getByLabel("Message the agent").fill("How many days do refunds take?");
  await page.getByRole("button", { name: "Send" }).click();
  const answered = page.getByTestId("agent-turn-succeeded").first();
  await expect(answered).toContainText("30 days", { timeout: 30_000 });
  await expect(answered).toContainText("Refund policy");

  await page.getByLabel("Message the agent").fill('run Doubler with {"n": 21}');
  await page.getByRole("button", { name: "Send" }).click();
  const approval = page.getByTestId("agent-approval");
  await expect(approval).toContainText('"n": 21', { timeout: 30_000 });
  await approval.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("agent-turn-succeeded")).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId("agent-turn-succeeded").nth(1)).toContainText('"v":42');
  const runs = (await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs as unknown[];
  expect(runs).toHaveLength(1); // ran exactly once, through the engine
});

test.describe("Copilot", () => {
  async function openCopilot(page: Page, slug: string, flowId: string) {
    await page.goto(`/w/${slug}/flows/${flowId}`);
    await page.getByRole("button", { name: "Copilot", exact: true }).click();
    return page.getByRole("dialog", { name: "Copilot" });
  }
  const ask = async (panel: ReturnType<Page["getByRole"]>, text: string) => {
    await panel.getByLabel("What should this workflow do?").fill(text);
    await panel.getByRole("button", { name: "Propose" }).click();
    return panel.getByTestId("copilot-proposal");
  };

  test("valid generation with a missing credential → approve → saved draft, nothing ran", { tag: "@critical" }, async ({ page }) => {
    const { workspace } = await setupUser(page);
    await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
    await page.goto(`/w/${workspace.slug}/flows`);
    const flowCount = async () => ((await (await page.request.get(`/api/workspaces/${workspace.id}/flows`)).json()).flows as unknown[]).length;
    await page.getByRole("button", { name: "✦ Create with Copilot" }).click();
    const panel = page.getByRole("dialog", { name: "Copilot" });
    // Abandoned or rejected attempts leave no empty draft behind (Codex CX3Q-05).
    let p = await ask(panel, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    await expect(p).toContainText("Proposal — review");
    await panel.getByRole("button", { name: "Reject" }).click();
    await expect(p).toContainText("rejected");
    expect(await flowCount()).toBe(0);

    p = await ask(panel, "Every Monday get the latest KPI data, summarize the important changes, and email leadership.");
    await expect(p.getByRole("list", { name: "Setup needed" })).toContainText(/Connect Gmail|Connect PostgreSQL/);
    await expect(p.getByLabel("Proposed changes")).toContainText("+ Gmail — Email leadership");
    await panel.getByRole("button", { name: "Approve & create draft" }).click();
    await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
    await expect(page.locator(".react-flow__node")).toHaveCount(5, { timeout: 15_000 });
    const flowId = page.url().split("/").pop()!;
    expect(await flowCount()).toBe(1);
    expect(((await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs as unknown[]).length).toBe(0);
  });

  test("invalid proposal and missing integration are explained and can't be applied; rejection changes nothing", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
    const panel = await openCopilot(page, workspace.slug, flowId!);
    let p = await ask(panel, "teleport the result");
    await expect(p.getByRole("alert")).toContainText("isn't a Flowline node type");
    await expect(panel.getByRole("button", { name: "Approve & save draft" })).toHaveCount(0);
    p = await ask(panel, "post the result to discord");
    await expect(p.getByRole("alert")).toContainText("isn't an available integration");
    const before = (await (await page.request.get(`/api/flows/${flowId}`)).json()).flow.revision as number;
    p = await ask(panel, "add a condition");
    await panel.getByRole("button", { name: "Reject" }).click();
    await expect(p).toContainText("rejected");
    expect((await (await page.request.get(`/api/flows/${flowId}`)).json()).flow.revision).toBe(before);
  });

  test("patching an existing flow keeps the user's steps; removals need explicit confirmation", async ({ page }) => {
    const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
    await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
    const panel = await openCopilot(page, workspace.slug, flowId!);
    const nodesBefore = await page.locator(".react-flow__node").count();
    let p = await ask(panel, "add a condition");
    await expect(p.getByLabel("Proposed changes")).toContainText("+ Has value?");
    await expect(p.getByLabel("Proposed changes")).not.toContainText(/−\s/); // no removed steps (edge counts are "−N")
    await panel.getByRole("button", { name: "Approve & save draft" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(nodesBefore + 1, { timeout: 15_000 });

    const panel2 = await openCopilot(page, workspace.slug, flowId!);
    p = await ask(panel2, "remove Has value?");
    await expect(p.getByLabel("Proposed changes")).toContainText("− Has value?");
    const approve = panel2.getByRole("button", { name: "Approve & save draft" });
    await expect(approve).toHaveAttribute("aria-disabled", "true");
    await panel2.getByLabel(/I understand this removes 1 existing step/).check();
    await approve.click();
    await expect(page.locator(".react-flow__node")).toHaveCount(nodesBefore, { timeout: 15_000 });
  });
});

test("billing sandbox: choose a test plan → fake checkout → verified webhook → plan in force", async ({ page }) => {
  test.setTimeout(120_000);
  const { workspace } = await setupUser(page);
  await page.goto(`/w/${workspace.slug}/settings?tab=plan`);
  await expect(page.getByText("Test mode")).toBeVisible();
  await expect(page.getByText(/configured price/).first()).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Test Starter" }).getByRole("button", { name: "Choose" }).click();
  await expect(page).toHaveURL(new RegExp(`${FAKE.replace(/[.:/]/g, "\\$&")}/stripe/checkout/`));
  await page.getByRole("button", { name: "Pay (test card)" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace.slug}/settings\\?billing=success`));
  await expect(page.getByText("Test Starter").first()).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/workspaces/${workspace.id}/billing`)).json()).account?.status, { timeout: 15_000 }).toMatch(/trialing|active/);
});

test("history: restore an older version as a draft (rollback) — history is kept", async ({ page }) => {
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  const v = (await (await page.request.get(`/api/flows/${flowId}`)).json()).flow as { revision: number; graph: { nodes: unknown[]; edges: unknown[] } };
  expect((await page.request.post(`/api/flows/${flowId}/publish`)).status()).toBe(201);
  const smaller = { nodes: v.graph.nodes.slice(0, 2), edges: [] };
  expect((await page.request.put(`/api/flows/${flowId}`, { data: { baseRevision: v.revision, graph: smaller } })).ok()).toBeTruthy();
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.getByRole("button", { name: "History" }).click();
  const panel = page.getByRole("dialog", { name: "Version history" });
  await panel.getByRole("list", { name: "Versions" }).getByRole("button").filter({ hasText: "publish" }).first().click();
  // Restoring reloads the builder with the restored draft: wait for that reload (slow under load), then check.
  await Promise.all([page.waitForEvent("load", { timeout: 60_000 }), panel.getByRole("button", { name: "Restore as draft" }).click()]);
  await expect(page.locator(".react-flow__node")).toHaveCount(v.graph.nodes.length, { timeout: 15_000 });
});

test("mobile: Agents and Knowledge fit a phone; Copilot and editing stay disabled on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });
  for (const p of ["agents", "knowledge", "settings"]) {
    await page.goto(`/w/${workspace.slug}/${p}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expect(page.getByRole("button", { name: "Copilot", exact: true })).toHaveAttribute("aria-disabled", "true");
});

test("SSO: owner configures the fake IdP, test sign-in links their account and verifies; members then sign in; existing accounts are never taken over", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { workspace, email: ownerEmail } = await setupUser(page);
  const domain = ownerEmail.split("@")[1]!;
  const idpUser = (email: string) => page.request.post(`${FAKE}/__fake/oidc/user`, { data: { email } });

  await page.goto(`/w/${workspace.slug}/settings?tab=sso`);
  await expect(page.getByText("Not configured")).toBeVisible();
  await page.getByLabel("Issuer URL").fill(`${FAKE}/oidc`);
  await page.getByLabel("Client ID").fill("flowline-e2e");
  await page.getByLabel("Client secret").fill("e2e-sso-secret");
  await page.getByLabel("Allowed email domains").fill(domain);
  await expect(page.getByLabel("SSO enabled")).toBeDisabled(); // not before a successful test sign-in
  await page.getByRole("button", { name: "Save SSO settings" }).click();
  await expect(page.getByText("Configured — not verified")).toBeVisible();

  // Test sign-in as the owner's own identity → linked, still the owner.
  await idpUser(ownerEmail);
  await page.getByRole("button", { name: "Test sign-in" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace.slug}/flows`));
  await page.goto(`/w/${workspace.slug}/settings?tab=sso`);
  await expect(page.getByText(/^Verified /).first()).toBeVisible();
  await expect(page.getByText("e2e-sso-secret")).toHaveCount(0);
  await page.getByLabel("SSO enabled").check();
  await page.getByRole("button", { name: "Save SSO settings" }).click();
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();

  // A new person signs in from the sign-in page and joins with the default role.
  const fresh = await browser.newContext({ baseURL: BASE_URL, storageState: EN_STATE });
  const p2 = await fresh.newPage();
  const newcomer = `sso-${randomUUID().slice(0, 8)}@${domain}`;
  await idpUser(newcomer);
  await p2.goto("/sign-in");
  await p2.getByLabel("Workspace slug").fill(workspace.slug);
  await p2.getByRole("button", { name: "Sign in with SSO" }).click();
  await expect(p2).toHaveURL(new RegExp(`/w/${workspace.slug}/flows`));
  await page.goto(`/w/${workspace.slug}/settings`);
  await expect(page.getByTestId(`member-${newcomer}`)).toContainText(/editor/i);

  // An existing password account in the domain is NOT signed in by the IdP asserting its email.
  const victim = await newUserContext(browser, `victim-${randomUUID().slice(0, 8)}@${domain}`);
  await victim.ctx.close();
  const p3 = await (await browser.newContext({ baseURL: BASE_URL, storageState: EN_STATE })).newPage();
  await idpUser(victim.email);
  await p3.goto("/sign-in");
  await p3.getByLabel("Workspace slug").fill(workspace.slug);
  await p3.getByRole("button", { name: "Sign in with SSO" }).click();
  await expect(p3).toHaveURL(/\/sign-in\?sso_error=/);
  await expect(p3.getByRole("alert").filter({ hasText: "SSO can't take over an existing account" })).toBeVisible();

  // Unknown workspace → honest refusal.
  await p3.getByLabel("Workspace slug").fill(`no-such-${randomUUID().slice(0, 6)}`);
  await p3.getByRole("button", { name: "Sign in with SSO" }).click();
  await expect(p3.getByRole("alert").filter({ hasText: "SSO isn't set up for that workspace" })).toBeVisible();

  await page.getByRole("button", { name: "Audit log" }).click();
  await expect(page.getByRole("list", { name: "Audit events" })).toContainText("sso.signin");
  await expect(page.getByRole("list", { name: "Audit events" })).toContainText("sso.configured");
});

test("a pending agent approval can be found again after navigating away (Codex CX3Q-01): dashboard → Review → Runs; viewer can't decide; owner approves once", { tag: "@cross-browser" }, async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { workspace } = await setupUser(page);
  await connectAiApi(page.request, workspace.id); // agents/Copilot run on the workspace AI connection
  const flowId = (await (await page.request.post(`/api/workspaces/${workspace.id}/flows`, { data: { name: "Doubler" } })).json()).flow.id as string;
  await saveGraph(page.request, flowId, {
    nodes: [manual('{ "n": 1 }'), { id: "x", type: "transform.json", position: pos(1), data: { label: "Double", config: { expression: '{ "v": n * 2 }' } } }, out(2)],
    edges: line("t", "x", "o"),
  });
  expect((await page.request.post(`/api/flows/${flowId}/publish`)).status()).toBe(201);
  const agent = (await (await page.request.post(`/api/workspaces/${workspace.id}/agents`, { data: { name: "Runner", instructions: "Run the Doubler when asked.", tools: [{ tool: "run_workflow", flowId, permission: "ask" }] } })).json()).agent;

  // A viewer joins.
  const inv = await (await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email: uniqueEmail("vw"), role: "viewer" } })).json();
  const v = await newUserContext(browser, inv.invite.email);
  expect((await v.page.request.post(`/api/invites/${new URL(inv.url).pathname.split("/").pop()}`)).ok()).toBeTruthy();

  await page.goto(`/w/${workspace.slug}/agents/${agent.id}`);
  await page.getByLabel("Message the agent").fill('run Doubler with {"n": 7}');
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("agent-approval")).toBeVisible({ timeout: 30_000 });

  // Navigate away; the request must still be reachable.
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("link", { name: "Review →" }).click();
  await expect(page).toHaveURL(new RegExp(`/agents/${agent.id}\\?tab=runs&run=`));
  const approval = page.getByRole("list", { name: "Selected run" }).getByTestId("agent-approval");
  await expect(approval).toContainText('"n": 7');

  // The viewer sees it, but can't decide.
  await v.page.goto(`/w/${workspace.slug}/agents/${agent.id}`);
  await expect(v.page.getByTestId("agent-waiting-banner")).toBeVisible();
  await v.page.getByTestId("agent-waiting-banner").getByRole("button", { name: "Review in Runs" }).click();
  const vApprove = v.page.getByRole("list", { name: "Selected run" }).getByRole("button", { name: "Approve" });
  await expect(vApprove).toHaveAttribute("aria-disabled", "true");
  await expect(vApprove).toHaveAccessibleDescription(/Only workspace owners and editors/);
  await v.ctx.close();

  await approval.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("list", { name: "Selected run" }).getByTestId("agent-turn-succeeded")).toContainText('"v":14', { timeout: 30_000 });
  expect(((await (await page.request.get(`/api/flows/${flowId}/runs`)).json()).runs as unknown[]).length).toBe(1);
});
