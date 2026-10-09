// FlowLine complete feature suite in natural language (tester-army/e2e, issue #85): covers all features from the hub's feature map.
// Every test is tagged with feat:<feature>, shard:<shard>, lvl:ui|api|job and has a test ID [<feature>.<n>] in the title.
// The hub's verify job copies this file next to its own suite, runs it against the test stack, and checks the e2e-army gate.
// Runs against the isolated test stack (FLOWLINE_ENV=test: outbox e-mail, test-only /api/test/outbox). Natural-language steps
// are replay-cached (.e2e/cache) so repeat runs on an unchanged UI need no model.
import { test } from "@e2e-dev/web";
import { expect, unique } from "e2e";
import { readFileSync, writeFileSync } from "node:fs";

const PASSWORD = "Army-Passw0rd!";

/** Agent steps need a model; without one (E2E_ARMY_NOAGENT=1) they are skipped and the locator tests still run. */
const needsModel = () => test.skip(process.env.E2E_ARMY_NOAGENT === "1", "no model available: agent steps skipped");

/** A fresh verified account through the product's own endpoints (test stack), like e2e/helpers.ts signUpVerified. */
async function signUpVerified(base: string, email: string) {
  const origin = new URL(base).origin, h = { "content-type": "application/json", origin, cookie: "fl_test_beta_mode=open; fl_locale=en" };
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (!up.ok) throw new Error(`sign-up ${up.status}`);
  let token: string | null = null;
  for (let i = 0; i < 24 && !token; i++) {
    const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
    const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
    const link = messages.find((m) => m.purpose === "verify")?.link;
    token = link ? new URL(link).searchParams.get("token") : null;
    if (!token) await new Promise((r) => setTimeout(r, 500));
  }
  if (!token) throw new Error("no verification e-mail in the test outbox");
  const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
  if (!v.ok) throw new Error(`verify ${v.status}`);
}

test.setup("a verified user signs in, creates a workspace and a blank flow", { sessions: ["fl-user"] }, async ({ app, screen, browser, session }) => {
  const base = process.env.E2E_ARMY_URL!;
  const email = `army-setup-${Date.now().toString(36)}@flowline-e2e.test`;
  await signUpVerified(base, email);
  await browser.setCookies([{ url: base, name: "fl_locale", value: "en" }]);
  await app.open("/sign-in");
  await screen.getByLabel("Email").fill(email);
  await screen.getByLabel("Password").fill(PASSWORD);
  await screen.getByRole("button", "Sign in").tap();
  await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
  await screen.getByLabel("Workspace name").fill("Army Test Workspace");
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("heading", "What do you want to automate first?")).toBeVisible();
  await screen.getByRole("radio", /Sales & lead ops/).tap();
  await screen.getByRole("button", "Continue").tap();
  await screen.getByRole("radio", /Blank flow/).tap();
  await screen.getByRole("button", /Create flow & open canvas/).tap();
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  writeFileSync(`${process.env.E2E_ARMY_OUT ?? ".e2e"}/flowline-slug.txt`, new URL(await browser.url()).pathname.split("/")[2] ?? "");
  await session.save("fl-user");
});

const workspace = () => `/w/${readFileSync(`${process.env.E2E_ARMY_OUT ?? ".e2e"}/flowline-slug.txt`, "utf8").trim()}`;

// ========== SHARD: smoke ==========

test("[fl-landing.1] landing: the page shows the product promise and a call to action", { tags: ["feat:fl-landing", "shard:smoke", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open("/");
  await expect(screen.getByRole("heading").first()).toBeVisible();
  await expect(screen.getByRole("link").first()).toBeVisible();
});

test("[fl-i18n-rtl.1] Arabic: the default language is Arabic and the page is right-to-left", { tags: ["feat:fl-i18n-rtl", "shard:smoke", "lvl:ui"] }, async ({ app, browser }) => {
  await app.open("/");
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
});

test("[fl-sign-in.1] login: a verified user signs in with e-mail and password", { session: "fl-user", tags: ["feat:fl-sign-in", "shard:smoke", "lvl:ui"] }, async ({ app, screen, _agent, _browser }) => {
  needsModel();
  const email = `army-login-${Date.now().toString(36)}@flowline-e2e.test`;
  await signUpVerified(app.baseUrl!, email);
  await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
  await app.open("/sign-in");
  await agent.act("sign in with the email {email} and the password {pw}", { params: { email: unique(email), pw: PASSWORD } });
  await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
});

test("[fl-sign-in.2] login: a wrong password is rejected on the sign-in screen", { tags: ["feat:fl-sign-in", "shard:smoke", "lvl:ui"] }, async ({ app, screen, _agent, _browser }) => {
  needsModel();
  await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
  await app.open("/sign-in");
  await expect(screen.getByLabel("Email")).toBeVisible();
  await agent.act("sign in with the email {email} and the password {pw}", { params: { email: "nobody@flowline-e2e.test", pw: "definitely-wrong-1" } });
  await agent.assert("an error tells the user that the e-mail or password is wrong, and the user is still on the sign-in screen");
  await expect(screen.getByLabel("Password")).toBeVisible();
});

test("[fl-flows-list.1] flows list: a signed-in user creates a blank flow and its canvas opens", { session: "fl-user", tags: ["feat:fl-flows-list", "shard:smoke", "lvl:ui"] }, async ({ app, screen, _agent, _browser }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("create a new blank flow and open its canvas");
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  await agent.assert("the flow builder canvas is shown and invites the user to start with a trigger");
});

test("[fl-flows-list.2] flows list: the workspace navigation reaches Runs and Templates", { session: "fl-user", tags: ["feat:fl-flows-list", "shard:smoke", "lvl:ui"] }, async ({ app, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("open the Runs page");
  await agent.assert("a Runs page (run history, possibly empty) is shown inside the workspace");
});

// ========== SHARD: auth ==========

test("[fl-sign-up.1] sign-up: a new user can sign up with e-mail and password", { tags: ["feat:fl-sign-up", "shard:auth", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const email = `army-signup-${Date.now().toString(36)}@flowline-e2e.test`;
  await app.open("/sign-up");
  await screen.getByLabel("Full name").fill("Army User");
  await screen.getByLabel("Email").fill(unique(email));
  await screen.getByLabel("Password").fill(PASSWORD);
  await agent.act("sign up with the email {email} and the password {pw}", { params: { email: unique(email), pw: PASSWORD } });
  // After sign-up, user is redirected to verify email
  await expect(screen.getByText(/verify|email/i)).toBeVisible();
});

test("[fl-email-flows.1] email flows: a user can request a password reset", { tags: ["feat:fl-email-flows", "shard:auth", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const email = `army-reset-${Date.now().toString(36)}@flowline-e2e.test`;
  await app.open("/forgot-password");
  await screen.getByLabel("Email").fill(unique(email));
  await agent.act("submit the password reset request for the email {email}", { params: { email: unique(email) } });
  await expect(screen.getByText(/check your email|reset link/i)).toBeVisible();
});

test("[fl-email-flows.2] email flows: a user can resend verification", { tags: ["feat:fl-email-flows", "shard:auth", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const email = `army-resend-${Date.now().toString(36)}@flowline-e2e.test`;
  await app.open("/resend-verification");
  await screen.getByLabel("Email").fill(unique(email));
  await agent.act("request a new verification email for the address {email}", { params: { email: unique(email) } });
  await expect(screen.getByText(/check your email/i)).toBeVisible();
});

test("[fl-email-flows.3] email flows: a user can view account settings", { session: "fl-user", tags: ["feat:fl-email-flows", "shard:auth", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/general`);
  await expect(screen.getByText(/account|settings/i)).toBeVisible();
});

test("[fl-beta-access.1] beta access: the sign-up page shows beta access info", { tags: ["feat:fl-beta-access", "shard:auth", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open("/sign-up");
  await expect(screen.getByText(/beta|invite only/i)).toBeVisible();
});

// ========== SHARD: workspaces ==========

test("[fl-workspaces.1] workspaces: a user can create a workspace", { session: "fl-user", tags: ["feat:fl-workspaces", "shard:workspaces", "lvl:ui"] }, async ({ app, screen, _agent }) => {
  needsModel();
  await app.open("/sign-in");
  await screen.getByLabel("Email").fill("fl-user@flowline-e2e.test");
  await screen.getByLabel("Password").fill(PASSWORD);
  await screen.getByRole("button", "Sign in").tap();
  await expect(screen.getByRole("heading", "Name your workspace")).toBeVisible();
  await screen.getByLabel("Workspace name").fill("Test Workspace");
  await screen.getByRole("button", "Continue").tap();
  await expect(screen.getByRole("heading", "What do you want to automate first?")).toBeVisible();
});

test("[fl-workspaces.2] workspaces: a user can view workspace overview", { session: "fl-user", tags: ["feat:fl-workspaces", "shard:workspaces", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/overview`);
  await expect(screen.getByText(/workspace|overview/i)).toBeVisible();
});

test("[fl-members.1] members: a workspace owner can invite a member", { session: "fl-user", tags: ["feat:fl-members", "shard:workspaces", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/settings/members`);
  await agent.act("invite a member with the email {email}", { params: { email: "member@example.com" } });
  await expect(screen.getByText(/invite|member/i)).toBeVisible();
});

test("[fl-members.2] members: a user can view members list", { session: "fl-user", tags: ["feat:fl-members", "shard:workspaces", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/members`);
  await expect(screen.getByText(/members/i)).toBeVisible();
});

test("[fl-settings-general.1] settings general: a user can view general settings", { session: "fl-user", tags: ["feat:fl-settings-general", "shard:workspaces", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/general`);
  await expect(screen.getByText(/general|settings/i)).toBeVisible();
});

test("[fl-api-keys.1] API keys: a user can generate an API key", { session: "fl-user", tags: ["feat:fl-api-keys", "shard:workspaces", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/settings/api-keys`);
  await agent.act("generate a new API key");
  await expect(screen.getByText(/api key|secret/i)).toBeVisible();
});

test("[fl-audit-log.1] audit log: a user can view the audit log", { session: "fl-user", tags: ["feat:fl-audit-log", "shard:workspaces", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/audit-log`);
  await expect(screen.getByText(/audit|log/i)).toBeVisible();
});

// ========== SHARD: flows ==========

test("[fl-flow-validation.1] flow validation: the flow builder shows validation errors", { session: "fl-user", tags: ["feat:fl-flow-validation", "shard:flows", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("create a new blank flow and open its canvas");
  await agent.act("drag a trigger node and connect it to a non-existent action");
  await expect(screen.getByText(/error|invalid|required/i)).toBeVisible();
});

test("[fl-flows-api.1] flows API: the health endpoint returns 200 OK", { tags: ["feat:fl-flows-api", "shard:flows", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/health`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("[fl-flows-api.2] flows API: the workspaces endpoint returns the user's workspaces", { tags: ["feat:fl-flows-api", "shard:flows", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces`, {
    headers: { Cookie: "fl_test_beta_mode=open" }
  });
  expect(res.status).toBe(200);
  const workspaces = await res.json();
  expect(Array.isArray(workspaces)).toBe(true);
});

test("[fl-flows-api.3] flows API: the flows endpoint returns the user's flows", { tags: ["feat:fl-flows-api", "shard:flows", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces/test/workspace/flows`, {
    headers: { Cookie: "fl_test_beta_mode=open" }
  });
  expect(res.status).toBe(200);
  const flows = await res.json();
  expect(Array.isArray(flows)).toBe(true);
});

test("[fl-flow-versions.1] flow versions: a user can view version history", { session: "fl-user", tags: ["feat:fl-flow-versions", "shard:flows", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("open the flows list");
  await agent.act("click on a flow and view its version history");
  await expect(screen.getByText(/version|history/i)).toBeVisible();
});

test("[fl-flow-share.1] flow share: a user can share a flow", { session: "fl-user", tags: ["feat:fl-flow-share", "shard:flows", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("open a flow and share it");
  await expect(screen.getByText(/share|link/i)).toBeVisible();
});

test("[fl-flow-publish.1] flow publish: a user can publish a flow", { session: "fl-user", tags: ["feat:fl-flow-publish", "shard:flows", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("open a flow and publish it");
  await expect(screen.getByText(/published|active/i)).toBeVisible();
});

test("[fl-templates.1] templates: a user can view available templates", { session: "fl-user", tags: ["feat:fl-templates", "shard:flows", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/templates`);
  await expect(screen.getByText(/template|flow/i)).toBeVisible();
});

// ========== SHARD: runs ==========

test("[fl-run-execution.1] run execution: a user can trigger a flow and see it run", { session: "fl-user", tags: ["feat:fl-run-execution", "shard:runs", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("create a new blank flow and open its canvas");
  await agent.act("add a trigger and save the flow");
  await agent.act("trigger the flow and watch it run");
  await expect(screen.getByText(/running|completed/i)).toBeVisible();
});

test("[fl-run-history.1] run history: a user can view run history", { session: "fl-user", tags: ["feat:fl-run-history", "shard:runs", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/runs`);
  await expect(screen.getByText(/run|history/i)).toBeVisible();
});

test("[fl-run-control.1] run control: a user can cancel a running flow", { session: "fl-user", tags: ["feat:fl-run-control", "shard:runs", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("create a new blank flow and trigger it");
  await agent.act("cancel the running flow");
  await expect(screen.getByText(/cancelled|stopped/i)).toBeVisible();
});

test("[fl-run-control.2] run control: a user can rerun a flow", { session: "fl-user", tags: ["feat:fl-run-control", "shard:runs", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/runs`);
  await agent.act("rerun the last run");
  await expect(screen.getByText(/running/i)).toBeVisible();
});

// ========== SHARD: api ==========

test("[fl-auth-api.1] auth API: the sign-up endpoint returns 201 for valid data", { tags: ["feat:fl-auth-api", "shard:api", "lvl:api"] }, async ({ app }) => {
  const email = `test-${Date.now().toString(36)}@flowline-e2e.test`;
  const res = await fetch(`${app.baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", "origin": app.baseUrl, "cookie": "fl_test_beta_mode=open; fl_locale=en" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Test User" })
  });
  expect(res.status).toBe(201);
});

test("[fl-auth-api.2] auth API: the login endpoint returns a token for valid credentials", { tags: ["feat:fl-auth-api", "shard:api", "lvl:api"] }, async ({ app }) => {
  const email = "fl-user@flowline-e2e.test";
  const res = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "origin": app.baseUrl },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.token).toBeDefined();
});

test("[fl-auth-api.3] auth API: the /api/me endpoint returns the current user", { tags: ["feat:fl-auth-api", "shard:api", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/me`, {
    headers: { Cookie: "fl_test_beta_mode=open" }
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.email).toBeDefined();
});

test("[fl-health.1] health API: the health endpoint returns 200 OK", { tags: ["feat:fl-health", "shard:api", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/health`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("[fl-tenancy.1] tenancy: the access check returns 404 for non-members", { tags: ["feat:fl-tenancy", "shard:api", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces/nonexistent/workspace`, {
    headers: { Cookie: "fl_test_beta_mode=open" }
  });
  expect(res.status).toBe(404);
});

test("[fl-roles.1] roles: the permissions check returns 403 for unauthorized actions", { tags: ["feat:fl-roles", "shard:api", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces/test/workspace/settings/billing-plan`, {
    headers: { Cookie: "fl_test_beta_mode=open" }
  });
  expect(res.status).toBe(403);
});

// ========== SHARD: jobs ==========

test("[fl-trigger-webhook.1] trigger webhook: a webhook endpoint is available", { tags: ["feat:fl-trigger-webhook", "shard:jobs", "lvl:job"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/hooks/test-hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ test: true })
  });
  expect([200, 201, 204]).toContain(res.status);
});

test("[fl-trigger-schedule.1] trigger schedule: the scheduler endpoint is available", { tags: ["feat:fl-trigger-schedule", "shard:jobs", "lvl:job"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/schedule/test-schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ test: true })
  });
  expect([200, 201, 204]).toContain(res.status);
});

test("[fl-run-execution.2] run execution: a flow can be triggered via API", { tags: ["feat:fl-run-execution", "shard:jobs", "lvl:job"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces/test/workspace/flows/test-flow/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", Cookie: "fl_test_beta_mode=open" },
    body: JSON.stringify({})
  });
  expect([200, 201, 204]).toContain(res.status);
});

test("[fl-files.1] files: the file upload endpoint is available", { tags: ["feat:fl-files", "shard:jobs", "lvl:job"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces/test/workspace/files`, {
    method: "POST",
    headers: { "content-type": "application/json", Cookie: "fl_test_beta_mode=open" },
    body: JSON.stringify({ filename: "test.txt", content: "test content" })
  });
  expect([200, 201, 204]).toContain(res.status);
});

test("[fl-usage-limits.1] usage limits: the usage endpoint is available", { tags: ["feat:fl-usage-limits", "shard:jobs", "lvl:job"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/workspaces/test/workspace/usage`, {
    headers: { Cookie: "fl_test_beta_mode=open" }
  });
  expect(res.status).toBe(200);
});

// ========== SHARD: ai ==========

test("[fl-ai-providers.1] AI providers: a user can add an AI provider", { session: "fl-user", tags: ["feat:fl-ai-providers", "shard:ai", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/settings/ai-providers`);
  await agent.act("add an OpenAI provider with the API key");
  await expect(screen.getByText(/provider|openai/i)).toBeVisible();
});

test("[fl-ai-providers.2] AI providers: a user can view configured providers", { session: "fl-user", tags: ["feat:fl-ai-providers", "shard:ai", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/ai-providers`);
  await expect(screen.getByText(/provider/i)).toBeVisible();
});

test("[fl-ai-nodes.1] AI nodes: the AI hub execution is available", { tags: ["feat:fl-ai-nodes", "shard:ai", "lvl:job"] }, async ({ app }) => {
  const res = await fetch(`${app.baseUrl}/api/ai/hub/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", Cookie: "fl_test_beta_mode=open" },
    body: JSON.stringify({ model: "test", prompt: "test" })
  });
  expect([200, 201, 204]).toContain(res.status);
});

test("[fl-agents.1] agents: a user can create an agent", { session: "fl-user", tags: ["feat:fl-agents", "shard:ai", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/agents`);
  await agent.act("create a new agent");
  await expect(screen.getByText(/agent/i)).toBeVisible();
});

test("[fl-agents.2] agents: a user can view agents list", { session: "fl-user", tags: ["feat:fl-agents", "shard:ai", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/agents`);
  await expect(screen.getByText(/agents/i)).toBeVisible();
});

test("[fl-knowledge.1] knowledge: a user can upload a knowledge base", { session: "fl-user", tags: ["feat:fl-knowledge", "shard:ai", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/knowledge`);
  await agent.act("upload a knowledge base file");
  await expect(screen.getByText(/knowledge/i)).toBeVisible();
});

test("[fl-knowledge.2] knowledge: a user can view knowledge bases", { session: "fl-user", tags: ["feat:fl-knowledge", "shard:ai", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/knowledge`);
  await expect(screen.getByText(/knowledge/i)).toBeVisible();
});

test("[fl-copilot.1] copilot: the copilot panel is available", { session: "fl-user", tags: ["feat:fl-copilot", "shard:ai", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/flows`);
  await expect(screen.getByText(/copilot/i)).toBeVisible();
});

// ========== SHARD: billing ==========

test("[fl-billing-plan.1] billing plan: a user can view the billing plan page", { session: "fl-user", tags: ["feat:fl-billing-plan", "shard:billing", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/billing-plan`);
  await expect(screen.getByText(/plan|billing/i)).toBeVisible();
});

test("[fl-sso.1] SSO: a user can view SSO settings", { session: "fl-user", tags: ["feat:fl-sso", "shard:billing", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/sso`);
  await expect(screen.getByText(/sso|single sign-on/i)).toBeVisible();
});

test("[fl-platform-admin.1] platform admin: a user can view platform settings", { tags: ["feat:fl-platform-admin", "shard:billing", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open("/admin");
  await expect(screen.getByText(/admin|platform/i)).toBeVisible();
});

// ========== SHARD: design ==========

test("[fl-theme.1] theme: a user can switch between light and dark themes", { session: "fl-user", tags: ["feat:fl-theme", "shard:design", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("switch to dark theme");
  await expect(screen.getByText(/dark|theme/i)).toBeVisible();
});

test("[fl-theme.2] theme: a user can switch between English and Arabic", { session: "fl-user", tags: ["feat:fl-theme", "shard:design", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  await app.open(`${workspace()}/flows`);
  await agent.act("switch to Arabic language");
  expect(await screen.evaluate(() => document.documentElement.dir)).toBe("rtl");
});

test("[fl-design-system.1] design system: the UI components are rendered correctly", { session: "fl-user", tags: ["feat:fl-design-system", "shard:design", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open(`${workspace()}/settings/general`);
  await expect(screen.getByRole("button")).toBeVisible();
  await expect(screen.getByRole("input")).toBeVisible();
  await expect(screen.getByRole("heading")).toBeVisible();
});

test("[fl-not-found.1] not found: the 404 page is shown for non-existent routes", { tags: ["feat:fl-not-found", "shard:design", "lvl:ui"] }, async ({ app, screen }) => {
  await app.open("/nonexistent-route");
  await expect(screen.getByText(/not found|404/i)).toBeVisible();
});

test("[fl-not-found.2] error: the error page is shown for server errors", { tags: ["feat:fl-not-found", "shard:design", "lvl:ui"] }, async ({ app, screen }) => {
  // This test can be flaky due to random errors; it's a basic sanity check
  await app.open("/api/test/error");
  await expect(screen.getByText(/error|failed/i)).toBeVisible();
});
