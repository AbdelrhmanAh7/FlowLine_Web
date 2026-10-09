// UI ADMIN shard (agent steps + exact checks): plan and billing with the payment double, workspace OAuth apps, single sign-on settings, the Company
// Builder interview and the closed platform admin panel. Session fl-user (English UI); every test works in a fresh workspace.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel, seeded } from "../lib.ts";
import { actor, freshWorkspace, fakeOrigin } from "./_helpers.ts";

const SESSION = { session: "fl-user" } as const;

test("[fl-billing-plan.1] the owner chooses a paid plan, pays on the test checkout and the plan takes effect in Settings", { ...SESSION, tags: ["feat:fl-billing-plan", "shard:ui-admin", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "admin-1");
  await app.open(`/w/${ws.slug}/settings?tab=plan`);
  await expect(screen.getByText("Test mode", { exact: false })).toBeVisible();
  await expect(screen.getByRole("listitem").filter({ hasText: "Test Starter" })).toBeVisible();
  await agent.act("choose the Test Starter plan and pay with the test card on the checkout page");
  await expect(browser).toHaveURL(new RegExp(`/w/${ws.slug}/settings\\?billing=success`), { timeout: 40_000 });
  await expect.poll(async () => (await http.get(`/api/workspaces/${ws.id}/billing`)).json.account?.status, { timeout: 30_000, interval: 500 }).toMatch(/trialing|active/);
  await expect(screen.getByText("Test Starter").first()).toBeVisible();
  await agent.assert("the plan and billing page shows Test Starter as the current plan");
  expect((await http.get(`/api/workspaces/${ws.id}/billing`)).json.planInForce).toBe("test_starter");
});

test("[fl-oauth-apps.2] the owner registers the workspace's own GitHub OAuth app in Settings; the secret is never shown again", { ...SESSION, tags: ["feat:fl-oauth-apps", "shard:ui-admin", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "admin-2");
  const secret = `gh-secret-${seeded("admin-2-secret", 12)}`;
  await app.open(`/w/${ws.slug}/settings?tab=oauthApps`);
  await expect(screen.getByTestId("oauth-app-github")).toBeVisible();
  await agent.act("set up the GitHub OAuth app with the client ID {id} and the client secret {secret} and save it", { params: { id: "army-gh-client", secret } });
  await expect.poll(async () => ((await http.get(`/api/workspaces/${ws.id}/oauth-apps`)).json.apps as any[]).map((a) => a.clientId), { timeout: 30_000, interval: 500 }).toEqual(["army-gh-client"]);
  await agent.assert("the GitHub OAuth app shows the client ID army-gh-client as configured and the secret is not displayed");
  await expect(screen.getByText(secret)).toBeHidden();
  expect((await http.get(`/api/workspaces/${ws.id}/oauth-apps`)).text).not.toContain(secret);
});

test("[fl-sso.2] the owner fills in the single sign-on settings and saves them; they stay inactive until a test sign-in verifies them", { ...SESSION, tags: ["feat:fl-sso", "shard:ui-admin", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "admin-3");
  const fake = await fakeOrigin(http, ws.id);
  await app.open(`/w/${ws.slug}/settings?tab=sso`);
  await expect(screen.getByText("Not configured")).toBeVisible();
  await expect(screen.getByRole("button", "Test sign-in")).toBeDisabled();
  await agent.act("save the SSO settings with the issuer URL {issuer}, the client ID {id}, the client secret {secret} and the allowed email domain {domain}", { params: { issuer: `${fake}/oidc`, id: "fake-oidc-client", secret: "fake-oidc-secret", domain: "flowline.test" } });
  await expect.poll(async () => (await http.get(`/api/workspaces/${ws.id}/sso`)).json.config?.clientId, { timeout: 30_000, interval: 500 }).toBe("fake-oidc-client");
  await expect(screen.getByText("Configured — not verified")).toBeVisible();
  await expect(screen.getByRole("button", "Test sign-in")).toBeEnabled();
  await agent.assert("the SSO settings show that single sign-on is configured but not verified yet");
  const cfg = (await http.get(`/api/workspaces/${ws.id}/sso`)).json.config;
  expect(cfg).toMatchObject({ domains: ["flowline.test"], enabled: false, hasSecret: true, verifiedAt: null });
});

test("[fl-company-builder.1] the owner starts the Company Builder interview and the first answer is saved with an inferred suggestion", { ...SESSION, tags: ["feat:fl-company-builder", "shard:ui-admin", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "admin-4");
  await app.open(`/w/${ws.slug}/company`);
  await expect(screen.getByRole("heading", "Build a digital team that knows your work.")).toBeVisible();
  await screen.getByTestId("cb-start").tap();
  await expect(browser).toHaveURL(new RegExp(`/w/${ws.slug}/company/[0-9a-f-]{36}$`));
  await expect(screen.getByTestId("cb-question")).toHaveAttribute("data-question", "offering");
  await agent.act("answer the question with {text} and save", { params: { text: "I run a small service business. Customer requests arrive by email and follow-up is inconsistent." } });
  await expect(screen.getByTestId("cb-question")).toHaveAttribute("data-question", "first_outcome", { timeout: 20_000 });
  await expect(screen.getByText("We inferred this from your description", { exact: false })).toBeVisible();
  await expect(screen.getByRole("radio", "Following up customer requests")).toBeChecked();
  await agent.assert("the next question asks to confirm the first result to improve and suggests following up customer requests");
  const sessions = (await http.get(`/api/workspaces/${ws.id}/company-builder/sessions`)).json.sessions as { status: string }[];
  expect(sessions).toHaveLength(1);
});

test("[fl-platform-admin.2] a signed-in workspace member who opens the platform admin panel sees the ordinary not-found page", { ...SESSION, tags: ["feat:fl-platform-admin", "shard:ui-admin", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  await app.open("/admin");
  await expect(screen.getByText("We couldn't find that page")).toBeVisible();
  await expect(screen.getByRole("link", "Go to my workspace")).toBeVisible();
  await agent.assert("the page says it could not find the page and offers to go to my workspace; no administration controls are visible");
  expect(await browser.url()).toMatch(/\/admin$/);
});
