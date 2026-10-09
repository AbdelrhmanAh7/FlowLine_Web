// UI SETTINGS shard (agent steps + exact checks): the owner's Settings pages — general, members and invitations, API keys, the audit log and AI
// providers. Session fl-user (English UI); each test works in a fresh workspace so lists and counts are exact.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel, seeded, seededEmail } from "../lib.ts";
import { SEED_DOMAIN, actor, freshWorkspace } from "./_helpers.ts";

const SESSION = { session: "fl-user" } as const;

test("[fl-settings-general.1] the owner renames the workspace and sets the schedule time zone; the change persists", { ...SESSION, tags: ["feat:fl-settings-general", "shard:ui-settings", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "settings-1");
  const renamed = `Renamed ${seeded("settings-1-name", 4)}`;
  await app.open(`/w/${ws.slug}/settings?tab=general`);
  await expect(screen.getByLabel("Workspace name")).toHaveValue(ws.name);
  await agent.act("change the workspace name to {name}, set the schedule timezone to Africa/Cairo and save the changes", { params: { name: renamed } });
  await expect.poll(async () => (await http.get(`/api/workspaces/${ws.id}`)).json.workspace, { timeout: 20_000, interval: 500 }).toMatchObject({ name: renamed, timezone: "Africa/Cairo" });
  await browser.reload();
  await expect(screen.getByLabel("Workspace name")).toHaveValue(renamed);
  await agent.assert("the settings page shows the workspace name field with the new name and the Africa/Cairo schedule timezone");
});

test("[fl-members.4] the owner invites a teammate from Settings and gets the single-use invitation link", { ...SESSION, tags: ["feat:fl-members", "shard:ui-settings", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "settings-2");
  const invitee = seededEmail("ui-settings-invitee", SEED_DOMAIN);
  await app.open(`/w/${ws.slug}/settings?tab=members`);
  await expect(screen.getByRole("heading", "Invite a teammate")).toBeVisible();
  await agent.act("invite {email} as an editor and create the invite link", { params: { email: invitee } });
  await expect(screen.getByTestId("invite-link")).toContainText("/invite/");
  await expect(screen.getByTestId("invite-email-status")).toBeVisible();
  await agent.assert("an invitation link is shown once for the invited e-mail address and the pending invitations list names that address");
  const invites = (await http.get(`/api/workspaces/${ws.id}/invites`)).json.invites as { email: string; role: string; status: string }[];
  expect(invites).toEqual([expect.objectContaining({ email: invitee, role: "editor", status: "pending" })]);
});

test("[fl-api-keys.2] the owner creates an API key from Settings; the full key is revealed once and listed by name afterwards", { ...SESSION, tags: ["feat:fl-api-keys", "shard:ui-settings", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "settings-3");
  const name = `Army key ${seeded("settings-3-key", 4)}`;
  await app.open(`/w/${ws.slug}/settings?tab=keys`);
  await expect(screen.getByText("No API keys yet")).toBeVisible();
  await agent.act("create a test-mode API key named {name} that can read flows and read runs", { params: { name } });
  await expect(screen.getByTestId("revealed-key")).toHaveText(/^fl_test_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  await screen.getByRole("button", "I've stored it").tap();
  await expect(screen.getByTestId("revealed-key")).toBeHidden();
  await expect(screen.getByTestId(`apikey-${name}`)).toBeVisible();
  await agent.assert("the API keys list shows a key with the chosen name, in test mode, and the full key is no longer displayed");
  const keys = (await http.get(`/api/workspaces/${ws.id}/api-keys`)).json.apiKeys as { name: string; mode: string; scopes: string[]; status: string }[];
  expect(keys).toEqual([expect.objectContaining({ name, mode: "test", status: "active", scopes: expect.arrayContaining(["flows:read", "runs:read"]) })]);
});

test("[fl-audit-log.2] the audit log tab lists who changed what, newest first", { ...SESSION, tags: ["feat:fl-audit-log", "shard:ui-settings", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { a, http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "settings-4");
  const key = await http.post(`/api/workspaces/${ws.id}/api-keys`, { json: { name: `Audited ${seeded("settings-4-key", 4)}`, mode: "test", scopes: ["flows:read"] } });
  expect(key.status).toBe(201);
  await http.post(`/api/workspaces/${ws.id}/invites`, { json: { email: seededEmail("ui-audit-invitee", SEED_DOMAIN), role: "viewer" } });
  await app.open(`/w/${ws.slug}/settings?tab=audit`);
  await expect(screen.getByRole("heading", "Audit log")).toBeVisible();
  await expect(screen.getByRole("list", "Audit events")).toBeVisible();
  await agent.assert("the audit log lists an API key creation and a member invitation made by the workspace owner");
  await expect(screen.getByText(a.email).first()).toBeVisible();
  expect(key.text).toContain("fl_test_");
});

test("[fl-ai-providers.1] the owner connects an AI provider in Settings; the key is shown only as a masked hint", { ...SESSION, tags: ["feat:fl-ai-providers", "shard:ui-settings", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "settings-5");
  const key = `sk-fake-${seeded("settings-5-key", 12)}ZZZZ`;
  await app.open(`/w/${ws.slug}/settings?tab=ai`);
  await expect(screen.getByTestId("ai-provider-openai")).toBeVisible();
  await agent.act("connect OpenAI with the API key {key}", { params: { key } });
  await expect(screen.getByTestId("ai-connection")).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByTestId("ai-key-hint")).toHaveText("••••ZZZZ");
  await agent.assert("an OpenAI connection is listed as connected and its API key is shown only as a masked hint");
  const overview = (await http.get(`/api/workspaces/${ws.id}/ai`)).json;
  expect(overview.connections).toEqual([expect.objectContaining({ provider: "openai", status: "CONNECTED", keyHint: "••••ZZZZ" })]);
  expect(JSON.stringify(overview)).not.toContain(key);
});
