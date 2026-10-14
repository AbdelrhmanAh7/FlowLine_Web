// PLATFORM API shard (no model): the integrations catalog, connections (token and OAuth), workspace-owned OAuth apps, billing with the payment
// provider double, workspace SSO, the Company Builder API and the platform-admin / federated-login surfaces that must stay closed.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase, seeded } from "../lib.ts";
import { Http, actor, addMember, anonymous, fakeOrigin, uuidRe, type Actor, type Json } from "./_helpers.ts";

async function freshWorkspace(http: Http, label: string) {
  return (await http.post("/api/workspaces", { json: { name: `Plat ${seeded(label, 5)}` } })).json.workspace as { id: string; slug: string; name: string };
}
const asOwner = (owner: { a: Actor; http: Http }, ws: { id: string; slug: string }) => ({ a: { ...owner.a, workspaceId: ws.id, slug: ws.slug } as Actor, http: owner.http });

// ── fl-integrations-catalog ──────────────────────────────────────────────────────────────────────────────────────────
test("[fl-integrations.2] the catalog lists every real provider with its actions, input schemas, connect fields and honest verification state", { tags: ["feat:fl-integrations", "shard:platform-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("plat-catalog");
  const stranger = await actor("plat-catalog-stranger");
  const res = await http.get(`/api/integrations/catalog?workspaceId=${a.workspaceId}`);
  expect(res.status).toBe(200);
  const cat = res.json;
  const ids = (cat.providers as { id: string }[]).map((p) => p.id);
  expect(ids).toEqual(["google_sheets", "gmail", "slack", "hubspot", "zendesk", "airtable", "snowflake", "github", "stripe", "notion", "postgres", "linear"]);
  expect(cat.count).toBe(12);
  expect(cat.actionCount).toBe((cat.providers as Json[]).reduce((n, p) => n + p.actions.length, 0));
  for (const p of cat.providers as Json[]) {
    expect(p.actions.length, p.id).toBeGreaterThan(0);
    expect(["oauth2", "api_key", "basic", "connection_string"]).toContain(p.authType);
    expect(p.verification, p.id).toMatchObject({ adapter: true });
    for (const act of p.actions) {
      expect(act.id.startsWith(`${p.id}.`), act.id).toBe(true);
      expect(["none", "idempotent", "non_idempotent"]).toContain(act.sideEffect);
      expect(act.inputSchema, act.id).toBeTruthy();
    }
    if (p.authType === "oauth2") expect(typeof p.oauthConfigured).toBe("boolean");
    else expect(p.oauthConfigured).toBeNull();
  }
  const by = (id: string) => (cat.providers as Json[]).find((p) => p.id === id);
  expect(["google_sheets", "slack"].map((id) => by(id).oauthConfigured)).toEqual([true, true]);
  expect(by("github").oauthConfigured).toBeNull();
  expect(by("slack").actions.map((x: Json) => x.id)).toEqual(["slack.post_message", "slack.list_channels"]);
  expect(by("stripe").connectFields.length).toBeGreaterThan(0);
  expect(by("stripe").connectFields.some((f: Json) => f.secret)).toBe(true);
  expect(by("gmail").actions.find((x: Json) => x.id === "gmail.send").sensitive).toBe(true);
  expect(typeof cat.runtime.codeSandbox.available).toBe("boolean");
  expect((await http.get(`/api/integrations/catalog?workspaceId=${stranger.a.workspaceId}`)).status).toBe(404);
  expect((await anonymous().get("/api/integrations/catalog")).status).toBe(401);
  expect((await http.get("/api/integrations/catalog")).status).toBe(200);
});

// ── fl-connections ───────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-connections.1] a pasted-token connection is verified with the provider, never shows its secret, can be reconnected to the same account only, hidden, and removed", { tags: ["feat:fl-connections", "shard:platform-api", "lvl:api"] }, async () => {
  const owner = await actor("plat-conn");
  const ws = await freshWorkspace(owner.http, "conn");
  const w = `/api/workspaces/${ws.id}`;
  const fake = await fakeOrigin(owner.http, ws.id);
  const label = `Slack ${seeded("conn-label", 4)}`;
  const made = await owner.http.post(`${w}/connections`, { json: { provider: "slack", label, fields: { token: "test-token" } } });
  expect(made.status).toBe(201);
  const conn = made.json.connection;
  expect(conn).toMatchObject({ provider: "slack", label, authType: "oauth2", status: "active", visibility: "workspace" });
  expect(conn.id).toMatch(uuidRe);
  expect(conn.accountLabel).toBeTruthy();
  expect(conn.scopes).toEqual(expect.arrayContaining(["chat:write", "channels:read"]));
  expect(made.text).not.toContain("test-token");
  const list = await owner.http.get(`${w}/connections`);
  expect(list.text).not.toContain("test-token");
  expect(list.json.connections.find((c: Json) => c.id === conn.id)).toMatchObject({ label, flowCount: 0 });
  expect((await owner.http.get(`/api/connections/${conn.id}`)).json.connection.id).toBe(conn.id);
  expect((await owner.http.post(`${w}/connections`, { json: { provider: "slack", label: "bad", fields: { token: "not-a-valid-token" } } })).json.error.code).toBe("CONNECTION_REJECTED");
  expect((await owner.http.post(`${w}/connections`, { json: { provider: "stripe", label: "bad", fields: {} } })).json.error.code).toBe("VALIDATION");
  expect((await owner.http.post(`${w}/connections`, { json: { provider: "no-such-app", label: "x", fields: {} } })).status).toBe(404);
  const sameAccount = await fetch(`${fake}/__fake/issue-token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "a" }) });
  const otherAccount = await fetch(`${fake}/__fake/issue-token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "b" }) });
  const re = await owner.http.patch(`/api/connections/${conn.id}`, { json: { fields: { token: (await sameAccount.json()).token } } });
  expect(re.status).toBe(200);
  expect(re.json.connection).toMatchObject({ id: conn.id, status: "active" });
  const different = await owner.http.patch(`/api/connections/${conn.id}`, { json: { fields: { token: (await otherAccount.json()).token } } });
  expect(different.status).toBe(409);
  expect(different.json.error.code).toBe("DIFFERENT_ACCOUNT");
  expect((await owner.http.patch(`/api/connections/${conn.id}`, { json: { visibility: "private" } })).json.connection.visibility).toBe("private");
  const editor = await addMember(asOwner(owner, ws), "plat-conn-editor", "editor");
  const viewer = await addMember(asOwner(owner, ws), "plat-conn-viewer", "viewer");
  expect((await viewer.http.get(`${w}/connections`)).status).toBe(200);
  expect((await viewer.http.post(`${w}/connections`, { json: { provider: "slack", label: "x", fields: { token: "test-token" } } })).status).toBe(403);
  expect((await viewer.http.del(`/api/connections/${conn.id}`)).status).toBe(403);
  expect((await editor.http.post(`${w}/connections`, { json: { provider: "slack", label: `Editor ${seeded("conn-ed", 4)}`, fields: { token: "test-token" } } })).status).toBe(201);
  const removed = await owner.http.del(`/api/connections/${conn.id}`);
  expect(removed.json).toMatchObject({ ok: true });
  expect((await owner.http.get(`/api/connections/${conn.id}`)).status).toBe(404);
  const audit = (await owner.http.get(`${w}/audit`)).json.events as { action: string }[];
  expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(["integration.connected", "integration.reconnected", "integration.deleted"]));
});

test("[fl-connections.2] OAuth connects an app through the provider's consent, is bound to the session that started it, single use, and refuses errors", { tags: ["feat:fl-connections", "shard:platform-api", "lvl:api"] }, async () => {
  const owner = await actor("plat-oauth");
  const other = await actor("plat-oauth-other");
  const ws = await freshWorkspace(owner.http, "oauth");
  const w = `/api/workspaces/${ws.id}`;
  const start = await owner.http.post("/api/oauth/start", { json: { workspaceId: ws.id, provider: "github" } });
  expect(start.status).toBe(200);
  const authorize = new URL(start.json.url);
  expect(authorize.pathname).toBe("/github/oauth/authorize");
  expect(authorize.searchParams.get("redirect_uri")).toBe(`${apiBase()}/api/oauth/callback`);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorize.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  const consent = await fetch(start.json.url, { redirect: "manual" });
  expect(consent.status).toBe(302);
  const back = new URL(consent.headers.get("location")!);
  const stranger = await other.http.get(back.pathname + back.search);
  expect(stranger.headers.get("location")).toContain("oauth=error");
  expect(stranger.headers.get("location")).toContain("OAUTH_STATE_INVALID");
  const done = await owner.http.get(back.pathname + back.search);
  expect(done.status).toBe(307);
  expect(done.headers.get("location")).toMatch(new RegExp(`/w/${ws.slug}/integrations\\?oauth=connected&connection=[0-9a-f-]{36}$`));
  expect(done.headers.get("referrer-policy")).toBe("no-referrer");
  const conns = (await owner.http.get(`${w}/connections`)).json.connections as Json[];
  expect(conns).toHaveLength(1);
  expect(conns[0]).toMatchObject({ provider: "github", authType: "oauth2", status: "active", oauthApp: { source: "platform", clientId: "fake-github-client-id" } });
  const replay = await owner.http.get(back.pathname + back.search);
  expect(replay.headers.get("location")).toContain("OAUTH_STATE_INVALID");
  const reconnect = await owner.http.post("/api/oauth/start", { json: { workspaceId: ws.id, provider: "github", connectionId: conns[0].id } });
  const consent2 = await fetch(reconnect.json.url, { redirect: "manual" });
  const back2 = new URL(consent2.headers.get("location")!);
  expect((await owner.http.get(back2.pathname + back2.search)).headers.get("location")).toContain("oauth=reconnected");
  expect(((await owner.http.get(`${w}/connections`)).json.connections as unknown[]).length).toBe(1);
  expect((await owner.http.post("/api/oauth/start", { json: { workspaceId: ws.id, provider: "stripe" } })).status).toBe(404);
  expect((await other.http.post("/api/oauth/start", { json: { workspaceId: ws.id, provider: "github" } })).status).toBe(404);
  expect((await owner.http.get("/api/oauth/callback?error=access_denied")).headers.get("location")).toContain("PROVIDER_DENIED");
  expect((await owner.http.get("/api/oauth/callback?code=x&state=not-a-state")).headers.get("location")).toContain("OAUTH_STATE_INVALID");
  expect((await anonymous().get("/api/oauth/callback?code=x&state=y")).headers.get("location")).toContain("/sign-in");
});

// ── fl-oauth-apps ────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-oauth-apps.1] an owner can bring the workspace's own OAuth app: write-only secret, revisioned, previewed for members, removable", { tags: ["feat:fl-oauth-apps", "shard:platform-api", "lvl:api"] }, async () => {
  const owner = await actor("plat-oapp");
  const ws = await freshWorkspace(owner.http, "oapp");
  const w = `/api/workspaces/${ws.id}`;
  const editor = await addMember(asOwner(owner, ws), "plat-oapp-editor", "editor");
  const empty = (await owner.http.get(`${w}/oauth-apps`)).json;
  expect(empty.apps).toEqual([]);
  expect(empty.platform.map((p: Json) => p.family).sort()).toEqual(["github", "google", "slack"]);
  const secret = `gh-secret-${seeded("oapp-secret", 12)}`;
  const put = await owner.http.put(`${w}/oauth-apps/github`, { json: { clientId: "army-github-client", secret, expectedRevision: 0 } });
  expect(put.status).toBe(200);
  expect(put.headers.get("cache-control")).toBe("no-store");
  expect(put.json.app).toMatchObject({ family: "github", clientId: "army-github-client", configured: true, revision: 1 });
  expect(put.text).not.toContain(secret);
  expect((await owner.http.get(`${w}/oauth-apps`)).text).not.toContain(secret);
  expect((await owner.http.put(`${w}/oauth-apps/github`, { json: { clientId: "army-github-client", secret, expectedRevision: 0 } })).json.error.code).toBe("REVISION_CONFLICT");
  expect((await owner.http.put(`${w}/oauth-apps/github`, { json: { clientId: "x", secret: "", expectedRevision: 1 } })).status).toBe(400);
  expect((await owner.http.put(`${w}/oauth-apps/github`, { json: { clientId: "x", secret, expectedRevision: 1, extra: true } })).status).toBe(400);
  expect((await owner.http.put(`${w}/oauth-apps/not-a-provider`, { json: { clientId: "x", secret, expectedRevision: 0 } })).status).toBe(404);
  const provenance = (await editor.http.get(`${w}/oauth-apps/provenance?provider=github`)).json.app;
  expect(provenance).toMatchObject({ source: "workspace", clientId: "army-github-client" });
  const slackProv = (await editor.http.get(`${w}/oauth-apps/provenance?provider=slack`)).json.app;
  expect(slackProv).toMatchObject({ source: "platform", clientId: "fake-slack-client-id" });
  expect((await editor.http.get(`${w}/oauth-apps`)).status).toBe(403);
  expect((await editor.http.put(`${w}/oauth-apps/github`, { json: { clientId: "hijack", secret, expectedRevision: 1 } })).status).toBe(403);
  expect((await owner.http.post(`${w}/oauth-apps/github/probe`, { json: {} })).json.result).toBe("client_accepted");
  const start = await owner.http.post("/api/oauth/start", { json: { workspaceId: ws.id, provider: "github" } });
  expect(new URL(start.json.url).searchParams.get("client_id")).toBe("army-github-client");
  expect((await owner.http.get(`${w}/oauth-apps/github/impact`)).json).toEqual({ affectedConnections: 0 });
  expect((await owner.http.del(`${w}/oauth-apps/github`, { json: { expectedRevision: 1 } })).json).toEqual({ affectedConnections: 0 });
  expect((await owner.http.get(`${w}/oauth-apps`)).json.apps).toEqual([]);
  const back = await owner.http.post("/api/oauth/start", { json: { workspaceId: ws.id, provider: "github" } });
  expect(new URL(back.json.url).searchParams.get("client_id")).toBe("fake-github-client-id");
});

// ── fl-billing-plan (api level) ──────────────────────────────────────────────────────────────────────────────────────
test("[fl-billing-plan.2] a plan is bought through checkout, applied by the verified payment webhook, changed and cancelled; forged webhooks are refused", { tags: ["feat:fl-billing-plan", "shard:platform-api", "lvl:api"] }, async () => {
  const owner = await actor("plat-bill");
  const ws = await freshWorkspace(owner.http, "bill");
  const w = `/api/workspaces/${ws.id}`;
  const before = (await owner.http.get(`${w}/billing`)).json;
  expect(before).toMatchObject({ configured: true, planInForce: "test_free", account: null });
  expect(before.plans.map((p: Json) => p.id)).toEqual(["test_free", "test_starter", "test_pro"]);
  expect(before.entitlements).toMatchObject({ maxMonthlyExecutions: 100 });
  expect((await owner.http.post(`${w}/billing/checkout`, { json: { planId: "nope" } })).json.error.code).toBe("UNKNOWN_PLAN");
  expect((await owner.http.post(`${w}/billing/checkout`, { json: { planId: "test_free" } })).json.error.message).toMatch(/free plan/);
  const editor = await addMember(asOwner(owner, ws), "plat-bill-editor", "editor");
  expect((await editor.http.get(`${w}/billing`)).status).toBe(200);
  expect((await editor.http.post(`${w}/billing/checkout`, { json: { planId: "test_starter" } })).status).toBe(403);
  const checkout = await owner.http.post(`${w}/billing/checkout`, { json: { planId: "test_starter" } });
  expect(checkout.status).toBe(200);
  expect(checkout.json.url).toMatch(/\/stripe\/checkout\/cs_test_/);
  const paid = await fetch(`${checkout.json.url}/complete`, { method: "POST", redirect: "manual" });
  expect(paid.status).toBe(303);
  expect(paid.headers.get("location")).toBe(`${apiBase()}/w/${ws.slug}/settings?billing=success`);
  await expect.poll(async () => (await owner.http.get(`${w}/billing`)).json.account?.status, { timeout: 20_000, interval: 500 }).toMatch(/trialing|active/);
  const starter = (await owner.http.get(`${w}/billing`)).json;
  expect(starter).toMatchObject({ planInForce: "test_starter", account: { planId: "test_starter", cancelAtPeriodEnd: false } });
  expect(starter.entitlements.maxMonthlyExecutions).toBe(5000);
  expect((await owner.http.post(`${w}/billing/change`, { json: { planId: "test_pro" } })).status).toBe(200);
  await expect.poll(async () => (await owner.http.get(`${w}/billing`)).json.planInForce, { timeout: 20_000, interval: 500 }).toBe("test_pro");
  expect((await owner.http.post(`${w}/billing/reconcile`)).json).toMatchObject({ configured: true });
  expect((await owner.http.post(`${w}/billing/cancel`, { json: { atPeriodEnd: true } })).status).toBe(200);
  await expect.poll(async () => (await owner.http.get(`${w}/billing`)).json.account.cancelAtPeriodEnd, { timeout: 20_000, interval: 500 }).toBe(true);
  const log = (await owner.http.get(`${w}/audit`)).json.events as { action: string }[];
  expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(["billing.checkout_started", "billing.plan_changed", "billing.cancelled"]));
  const forged = await anonymous().post("/api/billing/webhook", { body: JSON.stringify({ id: "evt_forged", type: "customer.subscription.updated" }), headers: { "stripe-signature": "t=1,v1=00", "content-type": "application/json" } });
  expect(forged.status).toBe(401);
  expect(forged.json.error.code).toBe("WEBHOOK_VERIFICATION_FAILED");
  expect((await anonymous().post("/api/billing/webhook", { body: "{}" })).status).toBe(401);
});

// ── fl-sso ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-sso.1] workspace single sign-on is configured by the owner only, validated, secret-free, and verified by a test sign-in", { tags: ["feat:fl-sso", "shard:platform-api", "lvl:api"] }, async () => {
  const owner = await actor("plat-sso");
  const ws = await freshWorkspace(owner.http, "sso");
  const w = `/api/workspaces/${ws.id}`;
  const fake = await fakeOrigin(owner.http, ws.id);
  const editor = await addMember(asOwner(owner, ws), "plat-sso-editor", "editor");
  const initial = (await owner.http.get(`${w}/sso`)).json;
  expect(initial).toMatchObject({ config: null, canManage: true, callbackUri: `${apiBase()}/api/sso/callback` });
  const body = { issuer: `${fake}/oidc`, clientId: "fake-oidc-client", clientSecret: "fake-oidc-secret", domains: ["flowline.test"], defaultRole: "viewer", enabled: false };
  expect((await owner.http.put(`${w}/sso`, { json: { ...body, issuer: "http://example.com" } })).json.error.message).toBe("Issuer must be https");
  expect((await owner.http.put(`${w}/sso`, { json: { ...body, defaultRole: "admin" } })).status).toBe(400);
  expect((await editor.http.put(`${w}/sso`, { json: body })).status).toBe(403);
  const saved = await owner.http.put(`${w}/sso`, { json: body });
  expect(saved.status).toBe(200);
  expect(saved.json.config).toMatchObject({ issuer: `${fake}/oidc`, clientId: "fake-oidc-client", hasSecret: true, domains: ["flowline.test"], defaultRole: "viewer", enabled: false, verifiedAt: null });
  expect(saved.text).not.toContain("fake-oidc-secret");
  const view = await editor.http.get(`${w}/sso`);
  expect(view.json.canManage).toBe(false);
  expect(view.text).not.toContain("fake-oidc-secret");
  const noWorkspace = await anonymous().get("/api/sso/start");
  expect(noWorkspace.headers.get("location")).toContain("/sign-in?sso_error=");
  const unknown = await anonymous().get("/api/sso/start?workspace=no-such-workspace-army");
  expect(unknown.headers.get("location")).toContain("sso_error=");
  const disabled = await anonymous().get(`/api/sso/start?workspace=${ws.slug}`);
  expect(disabled.headers.get("location")).toContain("/sign-in?sso_error=");
  const test = await owner.http.get(`/api/sso/start?workspace=${ws.slug}`);
  expect(test.status).toBe(307);
  expect(test.headers.get("location")).toContain(`${fake}/oidc/authorize`);
  const consent = await fetch(test.headers.get("location")!, { redirect: "manual" });
  const back = new URL(consent.headers.get("location")!);
  const finish = await owner.http.get(back.pathname + back.search);
  expect(finish.status).toBe(307);
  expect(finish.headers.get("location")).toBe(`${apiBase()}/w/${ws.slug}/settings?tab=sso`);
  expect((await owner.http.get(`${w}/sso`)).json.config.verifiedAt).not.toBeNull();
  expect((await anonymous().get(back.pathname + back.search)).headers.get("location")).toContain("sso_error=");
  expect((await anonymous().get("/api/sso/callback?code=x&state=y")).headers.get("location")).toContain("sso_error=");
  expect((await anonymous().get("/api/sso/link")).status).toBeGreaterThanOrEqual(401);
});

// ── fl-company-builder (api level) ───────────────────────────────────────────────────────────────────────────────────
test("[fl-company-builder.2] the Company Builder API runs the interview to an approved draft with sample trials, and keeps tenants and the CLI prototype closed", { tags: ["feat:fl-company-builder", "shard:platform-api", "lvl:api"] }, async () => {
  const owner = await actor("plat-cb");
  const ws = await freshWorkspace(owner.http, "cb");
  const w = `/api/workspaces/${ws.id}/company-builder`;
  const stranger = await actor("plat-cb-stranger");
  const viewer = await addMember(asOwner(owner, ws), "plat-cb-viewer", "viewer");
  expect((await owner.http.get(`${w}/sessions`)).json).toMatchObject({ sessions: [], prototype: { allowed: false } });
  expect((await stranger.http.get(`${w}/sessions`)).status).toBe(404);
  expect((await anonymous().get(`${w}/sessions`)).status).toBe(401);
  expect((await viewer.http.get(`${w}/sessions`)).status).toBe(200);
  expect((await viewer.http.post(`${w}/sessions`, { json: {} })).status).toBe(403);
  const created = await owner.http.post(`${w}/sessions`, { json: {} });
  expect(created.status).toBe(201);
  const sid = created.json.session.id as string;
  let revision = created.json.session.revision as number;
  const answer = async (questionId: string, value?: unknown, extra: Record<string, unknown> = {}) => {
    const r = await owner.http.post(`${w}/sessions/${sid}/answer`, { json: { questionId, value, revision, ...extra } });
    expect(r.status, questionId).toBe(200);
    revision = r.json.session;
  };
  const stale = await owner.http.post(`${w}/sessions/${sid}/answer`, { json: { questionId: "offering", value: "x", revision: 99 } });
  expect(stale.status).toBeGreaterThanOrEqual(400);
  await answer("offering", "I run a small service business. Customer requests arrive by email.");
  await answer("first_outcome", "customer");
  await answer("situation", "improve");
  await answer("cust_channel", "email");
  await answer("cust_reviewer", "owner");
  await answer("cust_details", ["service", "date"]);
  await answer("team", "small");
  await answer("tools", ["gmail"]);
  await answer("cust_next", "reply");
  await answer("cust_services", "office cleaning");
  await answer("cust_info", "Our monthly plan costs 300 SAR.");
  await answer("cust_volume", undefined, { unknown: true });
  await answer("other_areas", undefined, { unknown: true });
  const overview = (await owner.http.get(`${w}/sessions/${sid}`)).json;
  expect(overview.session.readiness).toMatchObject({ complete: true, missing: [], departments: ["customer"] });
  expect(overview.session.facts["customer.channel"].value).toBe("email");
  const bp = await owner.http.post(`${w}/sessions/${sid}/blueprint`);
  expect(bp.json).toMatchObject({ version: 1, created: true });
  expect((await owner.http.post(`${w}/blueprints/${bp.json.blueprintId}/approve`)).status).toBe(200);
  const inst = await owner.http.post(`${w}/blueprints/${bp.json.blueprintId}/install`);
  expect(inst.json).toMatchObject({ status: "installed", created: 1 });
  const after = (await owner.http.get(`${w}/sessions/${sid}`)).json;
  expect(after.tasks.length).toBe(1);
  const task = after.tasks[0].task;
  expect(task.id).toBe("customer-follow-up");
  const trialKey = seeded("cb-trial", 12);
  const trial = await owner.http.post(`${w}/installations/${inst.json.installationId}/tasks/${task.id}/trial`, { json: { trialKey } });
  expect(trial.status).toBe(201);
  expect((await owner.http.post(`${w}/installations/${inst.json.installationId}/tasks/${task.id}/trial`, { json: { trialKey } })).json).toMatchObject({ duplicate: true, trialId: trial.json.trialId });
  await expect.poll(async () => (await owner.http.get(`${w}/trials/${trial.json.trialId}`)).json.trial.status, { timeout: 30_000, interval: 500 }).toBe("completed");
  expect((await owner.http.post(`${w}/trials/${trial.json.trialId}/verdict`, { json: { verdict: "accepted" } })).json.trial.userVerdict).toBe("accepted");
  expect((await owner.http.get(`${w}/sessions/${sid}/cli-jobs`)).status).toBe(404);
  expect((await owner.http.get(`${w}/sessions/${sid}/export`)).json).toMatchObject({ format: "flowline-cb-interview", sessionId: sid });
  expect((await owner.http.del(`${w}/sessions/${sid}`)).json).toEqual({ ok: true });
  expect((await owner.http.get(`${w}/sessions/${sid}`)).status).toBe(404);
});

// ── fl-platform-admin / federated sign-in surfaces (closed in a stack without an operator) ──────────────────────────
test("[fl-platform-admin.1] the platform admin API answers 404 to everyone without an admin session, and the panel pages are the ordinary 404", { tags: ["feat:fl-platform-admin", "shard:platform-api", "lvl:api"] }, async () => {
  const { http } = await actor("plat-admin-denied");
  const gets = ["/api/platform/me", "/api/platform/admins", "/api/platform/audit", "/api/platform/copy", "/api/platform/credentials", "/api/platform/credentials/signin.google", "/api/platform/setup"];
  for (const path of gets) {
    expect((await http.get(path)).status, `user GET ${path}`).toBe(404);
    expect((await anonymous().get(path)).status, `visitor GET ${path}`).toBe(404);
  }
  for (const path of ["/api/platform/step-up", "/api/platform/credentials/signin.google/revoke", "/api/platform/credentials/signin.google/clear", "/api/platform/copy"]) {
    const r = await http.post(path, { json: {} });
    expect(r.status, `user POST ${path}`).toBe(404);
  }
  for (const path of ["/api/platform/setup/redeem", "/api/platform/setup/complete", "/api/platform/setup/email"]) {
    const r = await http.post(path, { json: {} });
    expect(r.status, `user POST ${path}`).toBeGreaterThanOrEqual(400);
    expect(r.status, `user POST ${path}`).toBeLessThan(500);
  }
  expect((await http.patch("/api/platform/copy", { json: { action: "edit", edits: [], expectedRevision: 0 } })).status).toBe(404);
  for (const page of ["/admin", "/admin/copy"]) {
    const r = await http.get(page);
    expect(r.status, page).toBe(404);
    expect(r.text, page).not.toMatch(/authenticator|setup code|copy editor/i);
  }
});

test("[fl-zitadel-federated-mfa.1] without a configured ZITADEL tenant the federated sign-in endpoints are closed and the step-up page tells the user to restart", { tags: ["feat:fl-zitadel-federated-mfa", "shard:platform-api", "lvl:api"] }, async () => {
  const { http } = await actor("plat-zitadel");
  expect((await anonymous().get("/api/identity/zitadel/discovery")).status).toBe(404);
  expect((await anonymous().get("/api/identity/zitadel/jwks")).status).toBe(404);
  expect((await anonymous().get("/api/auth-config")).json.zitadel).toBe(false);
  const get = await anonymous().get("/api/federation/step-up");
  expect(get.status).toBe(401);
  expect(get.json.error.code).toBe("FEDERATED_MFA_INVALID");
  const post = await anonymous().post("/api/federation/step-up", { json: { code: "123456" } });
  expect(post.status).toBeGreaterThanOrEqual(400);
  expect((await anonymous().post("/api/federation/step-up", { json: { code: "12" } })).status).toBeGreaterThanOrEqual(400);
  expect((await http.get("/api/sso/link")).status).toBe(403);
  expect((await http.post("/api/sso/link", { json: { action: "verify-email" } })).status).toBeGreaterThanOrEqual(400);
  const page = await new Http(undefined, { fl_locale: "en" }).get("/auth/step-up");
  expect(page.status).toBe(200);
  expect(page.text).toMatch(/Start sign-in again|Restart/);
});
