// CORE API shard (no model): accounts and sessions, e-mail account flows, private-beta gating, onboarding, workspaces, tenancy, the role
// matrix, members and invitations, API keys and the audit log. Everything goes through the product's own HTTP API.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { apiBase, seeded, freshEmail } from "../lib.ts";
import { Http, PASSWORD, SEED_DOMAIN, actor, addMember, anonymous, awaitMail, chain, newFlow, outbox, signIn, signUpVerified, startRun, tokenOf, uuidRe } from "./_helpers.ts";

const mailOf = (name: string) => freshEmail(name, SEED_DOMAIN);

// ── fl-auth-api ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-auth-api.1] sign-up opens no session until the e-mail link is used, then sign-in and /api/me work", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const email = mailOf("auth-api-1");
  const h = new Http();
  const up = await h.post("/api/auth/sign-up/email", { json: { email, password: PASSWORD, name: "Army Auth" } });
  expect(up.status).toBe(200);
  expect(up.json.token).toBeNull();
  expect((await h.get("/api/me")).status).toBe(401);
  const early = await h.post("/api/auth/sign-in/email", { json: { email, password: PASSWORD } });
  expect(early.status).toBe(403);
  expect(early.text).toMatch(/not verified/i);
  const mail = await awaitMail(h, email, "verify");
  expect(mail.link).toMatch(/\/verify-email\?token=[A-Za-z0-9_-]{40,}/);
  const token = tokenOf(mail.link);
  expect((await h.post("/api/email", { json: { action: "verify", token } })).json.status).toBe("done");
  expect((await h.post("/api/email", { json: { action: "verify", token } })).json.status).toBe("used");
  const signed = await h.post("/api/auth/sign-in/email", { json: { email, password: PASSWORD } });
  expect(signed.status).toBe(200);
  const me = await h.get("/api/me");
  expect(me.status).toBe(200);
  expect(me.json.user.email).toBe(email);
  expect(me.json.workspaces).toEqual([]);
  expect(me.json.onboarding.completed).toBe(false);
});

test("[fl-auth-api.2] wrong credentials are refused without telling which part was wrong, and input is validated", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const { a } = await actor("auth-api-2");
  const wrongPw = await anonymous().post("/api/auth/sign-in/email", { json: { email: a.email, password: "definitely-wrong-1" } });
  const noUser = await anonymous().post("/api/auth/sign-in/email", { json: { email: mailOf("no-such-user"), password: "definitely-wrong-1" } });
  expect(wrongPw.status).toBe(401);
  expect(noUser.status).toBe(401);
  expect(wrongPw.json.message).toBe(noUser.json.message);
  const short = await anonymous().post("/api/auth/sign-up/email", { json: { email: mailOf("short-pw"), password: "short", name: "S" } });
  expect(short.status).toBe(400);
  const badMail = await anonymous().post("/api/auth/sign-up/email", { json: { email: "not-an-email", password: PASSWORD, name: "S" } });
  expect(badMail.status).toBe(400);
});

test("[fl-auth-api.3] signing out ends the session: protected endpoints answer 401 afterwards", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const { a } = await actor("auth-api-3");
  const h = await signIn(a.email);
  expect((await h.get("/api/me")).status).toBe(200);
  const out = await h.post("/api/auth/sign-out", { json: {} });
  expect(out.status).toBe(200);
  const after = await h.get("/api/me");
  expect(after.status).toBe(401);
  expect(after.json.error.code).toBe("UNAUTHORIZED");
  for (const path of ["/api/workspaces", "/api/ai/providers", "/api/integrations/catalog"]) expect((await anonymous().get(path)).status).toBe(401);
});

test("[fl-auth-api.4] replaced and blocked auth endpoints do not exist, and a cross-site write with a session cookie is refused", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("auth-api-4");
  expect((await anonymous().get("/api/auth/verify-email?token=x")).status).toBe(404);
  expect((await anonymous().post("/api/auth/request-password-reset", { json: { email: a.email } })).status).toBe(404);
  expect((await anonymous().post("/api/auth/two-factor/send-otp", { json: {} })).status).toBe(404);
  const cross = await http.post("/api/workspaces", { json: { name: "Cross Site Co" }, headers: { origin: "https://evil.example" } });
  expect(cross.status).toBe(403);
  expect(cross.json.error.code).toBe("CROSS_SITE_REQUEST");
  const mine = await http.get("/api/workspaces");
  expect((mine.json.workspaces as { name: string }[]).some((w) => w.name === "Cross Site Co")).toBe(false);
});

test("[fl-auth-api.5] /api/auth-config tells the sign-in screen which methods exist and whether sign-up is invitation-only", { tags: ["feat:fl-auth-api", "shard:core-api", "lvl:api"] }, async () => {
  const open = await new Http(apiBase(), { fl_test_beta_mode: "open" }).get("/api/auth-config");
  expect(open.status).toBe(200);
  expect(open.json).toMatchObject({ email: true, betaMode: "open" });
  expect(typeof open.json.google).toBe("boolean");
  expect(typeof open.json.github).toBe("boolean");
  expect(typeof open.json.zitadel).toBe("boolean");
  const closed = await new Http(apiBase(), { fl_test_beta_mode: "invite_only" }).get("/api/auth-config");
  expect(closed.json.betaMode).toBe("invite_only");
});

// ── fl-email-flows (api level) ───────────────────────────────────────────────────────────────────────────────────────
test("[fl-email-flows.2] a forgotten password is reset with a single-use e-mailed link, and the old password stops working", { tags: ["feat:fl-email-flows", "shard:core-api", "lvl:api"] }, async () => {
  const { a } = await actor("email-reset");
  const h = anonymous();
  const sent = await h.post("/api/email", { json: { action: "forgot", email: a.email } });
  expect(sent.status).toBe(200);
  expect(sent.json.status).toBe("sent_if_eligible");
  const mail = await awaitMail(h, a.email, "reset");
  expect(mail.link).toMatch(/\/reset-password\?token=/);
  const token = tokenOf(mail.link);
  const tooShort = await h.post("/api/email", { json: { action: "reset", token, password: "short" } });
  expect(tooShort.status).toBe(400);
  const next = `${PASSWORD}-2`;
  const done = await h.post("/api/email", { json: { action: "reset", token, password: next } });
  expect(done.json.status).toBe("done");
  expect((await h.post("/api/email", { json: { action: "reset", token, password: `${next}-3` } })).json.status).toBe("used");
  expect((await anonymous().post("/api/auth/sign-in/email", { json: { email: a.email, password: PASSWORD } })).status).toBe(401);
  expect((await anonymous().post("/api/auth/sign-in/email", { json: { email: a.email, password: next } })).status).toBe(200);
  expect((await h.post("/api/email", { json: { action: "reset", token: "x".repeat(50), password: next } })).json.status).toBe("invalid");
});

test("[fl-email-flows.3] forgot/resend answer the same for known and unknown addresses, and are rate limited per address", { tags: ["feat:fl-email-flows", "shard:core-api", "lvl:api"] }, async () => {
  const { a } = await actor("email-enum");
  const h = anonymous();
  const known = await h.post("/api/email", { json: { action: "forgot", email: a.email } });
  const unknown = await h.post("/api/email", { json: { action: "forgot", email: mailOf("nobody-here") } });
  expect(known.status).toBe(200);
  expect(unknown.status).toBe(200);
  expect(unknown.json).toEqual(known.json);
  expect((await h.post("/api/email", { json: { action: "resend", email: mailOf("nobody-here-2") } })).json.status).toBe("sent_if_eligible");
  const limited = mailOf("rate-limited");
  const codes: number[] = [];
  for (let i = 0; i < 4; i++) codes.push((await h.post("/api/email", { json: { action: "forgot", email: limited } })).status);
  expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
  expect(codes[3]).toBe(429);
});

test("[fl-email-flows.4] deleting the account needs an e-mailed confirmation and removes the account for good", { tags: ["feat:fl-email-flows", "shard:core-api", "lvl:api"] }, async () => {
  const email = mailOf("delete-me");
  await signUpVerified(email, "Delete Me");
  const h = await signIn(email);
  expect((await anonymous().post("/api/email", { json: { action: "deleteRequest" } })).status).toBe(401);
  expect((await h.post("/api/email", { json: { action: "deleteRequest" } })).json.status).toBe("sent");
  const mail = await awaitMail(h, email, "delete");
  expect(mail.link).toMatch(/\/account\/delete\?token=/);
  const token = tokenOf(mail.link);
  expect((await anonymous().post("/api/email", { json: { action: "deleteConfirm", token } })).status).toBe(401);
  const done = await h.post("/api/email", { json: { action: "deleteConfirm", token } });
  expect(done.json.status).toBe("done");
  expect((await anonymous().post("/api/auth/sign-in/email", { json: { email, password: PASSWORD } })).status).toBe(401);
  expect((await h.get("/api/me")).status).toBe(401);
});

// ── fl-beta-access ───────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-beta-access.1] the sign-up pre-check follows the beta mode and admits a valid beta code", { tags: ["feat:fl-beta-access", "shard:core-api", "lvl:api"] }, async () => {
  const email = mailOf("beta-check");
  const open = new Http(apiBase(), { fl_locale: "en", fl_test_beta_mode: "open" });
  expect((await open.post("/api/beta/check", { json: { email } })).json).toEqual({ allowed: true, mode: "open" });
  const closed = new Http(apiBase(), { fl_locale: "en", fl_test_beta_mode: "invite_only" });
  expect((await closed.post("/api/beta/check", { json: { email } })).json).toEqual({ allowed: false, mode: "invite_only" });
  const minted = await closed.post("/api/test/beta", { json: { createCode: true } });
  expect(minted.status).toBe(200);
  expect(minted.json.code).toMatch(/^FL-[A-Z0-9]+$/);
  expect((await closed.post("/api/beta/check", { json: { email, code: minted.json.code } })).json.allowed).toBe(true);
  expect((await closed.post("/api/beta/check", { json: { email, code: "FL-WRONGCODE1" } })).json.allowed).toBe(false);
  expect((await closed.post("/api/beta/check", { json: { email: "nope" } })).status).toBe(400);
});

test("[fl-beta-access.2] in invitation-only mode a sign-up needs an invitation or a single-use beta code; refusals are silent (no mail, no account)", { tags: ["feat:fl-beta-access", "shard:core-api", "lvl:api"] }, async () => {
  const closed = new Http(apiBase(), { fl_locale: "en", fl_test_beta_mode: "invite_only" });
  const signUp = (email: string, extra: Record<string, unknown> = {}) => closed.post("/api/auth/sign-up/email", { json: { email, password: PASSWORD, name: "Beta Tester", ...extra } });
  const login = (email: string) => closed.post("/api/auth/sign-in/email", { json: { email, password: PASSWORD } });
  // Sign-up answers the same for everyone (no account enumeration); what differs is whether an account and a verification mail exist.
  const uninvited = mailOf("beta-uninvited");
  const refused = await signUp(uninvited);
  expect(refused.status).toBe(200);
  expect(refused.json.token).toBeNull();
  expect(await outbox(closed, uninvited)).toHaveLength(0);
  expect((await login(uninvited)).status).toBe(401);
  const code = (await closed.post("/api/test/beta", { json: { createCode: true } })).json.code as string;
  const coded = mailOf("beta-coded");
  expect((await signUp(coded, { betaCode: code })).status).toBe(200);
  expect((await awaitMail(closed, coded, "verify")).link).toMatch(/\/verify-email\?token=/);
  expect((await login(coded)).status).toBe(403);
  const reused = mailOf("beta-coded-2");
  expect((await signUp(reused, { betaCode: code })).status).toBe(200);
  expect(await outbox(closed, reused)).toHaveLength(0);
  expect((await login(reused)).status).toBe(401);
});

// ── fl-onboarding (api level) ────────────────────────────────────────────────────────────────────────────────────────
test("[fl-onboarding.1] onboarding records the chosen goal or the skip, and is validated", { tags: ["feat:fl-onboarding", "shard:core-api", "lvl:api"] }, async () => {
  const goal = mailOf("onb-goal"), skip = mailOf("onb-skip");
  await signUpVerified(goal, "Onb Goal");
  await signUpVerified(skip, "Onb Skip");
  const g = await signIn(goal);
  expect((await g.get("/api/me")).json.onboarding).toEqual({ completed: false, skipped: false, goal: null });
  expect((await g.post("/api/onboarding", { json: { goal: "marketing", skipped: false } })).status).toBe(400);
  expect((await anonymous().post("/api/onboarding", { json: { goal: "data", skipped: false } })).status).toBe(401);
  expect((await g.post("/api/onboarding", { json: { goal: "data", skipped: false } })).json).toEqual({ ok: true });
  expect((await g.get("/api/me")).json.onboarding).toEqual({ completed: true, skipped: false, goal: "data" });
  const s = await signIn(skip);
  await s.post("/api/onboarding", { json: { goal: null, skipped: true } });
  expect((await s.get("/api/me")).json.onboarding).toEqual({ completed: true, skipped: true, goal: null });
});

// ── fl-workspaces ────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-workspaces.1] creating a workspace makes the creator its owner with a unique URL slug", { tags: ["feat:fl-workspaces", "shard:core-api", "lvl:api"] }, async () => {
  const { http } = await actor("ws-create");
  const name = `Army Co ${seeded("ws-name", 4)}`;
  const c1 = await http.post("/api/workspaces", { json: { name } });
  expect(c1.status).toBe(201);
  expect(c1.json.workspace.name).toBe(name);
  expect(c1.json.workspace.id).toMatch(uuidRe);
  const c2 = await http.post("/api/workspaces", { json: { name } });
  expect(c2.status).toBe(201);
  expect(c2.json.workspace.slug).toBe(`${c1.json.workspace.slug}-2`);
  const list = (await http.get("/api/workspaces")).json.workspaces as { id: string; slug: string; role: string }[];
  expect(list.find((w) => w.id === c1.json.workspace.id)).toMatchObject({ slug: c1.json.workspace.slug, role: "owner" });
  const one = await http.get(`/api/workspaces/${c1.json.workspace.id}`);
  expect(one.status).toBe(200);
  expect(one.json.role).toBe("owner");
  expect((await http.post("/api/workspaces", { json: { name: "x" } })).status).toBe(400);
  expect((await http.post("/api/workspaces", { json: { name: "y".repeat(61) } })).status).toBe(400);
  expect((await anonymous().post("/api/workspaces", { json: { name } })).status).toBe(401);
});

test("[fl-workspaces.2] the owner renames the workspace and sets its time zone and limits; invalid values are rejected", { tags: ["feat:fl-workspaces", "shard:core-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("ws-patch");
  const base = `/api/workspaces/${a.workspaceId}`;
  const renamed = `Army Renamed ${seeded("ws-rename", 4)}`;
  const ok = await http.patch(base, { json: { name: renamed, timezone: "Africa/Cairo", maxConcurrentRuns: 3, maxQueuedRuns: 50 } });
  expect(ok.status).toBe(200);
  expect(ok.json.workspace).toMatchObject({ name: renamed, timezone: "Africa/Cairo", maxConcurrentRuns: 3, maxQueuedRuns: 50 });
  expect((await http.get(base)).json.workspace.name).toBe(renamed);
  expect((await http.patch(base, { json: { timezone: "Mars/Olympus" } })).status).toBe(400);
  expect((await http.patch(base, { json: { name: "x" } })).status).toBe(400);
  expect((await http.patch(base, { json: { maxConcurrentRuns: 99 } })).status).toBe(400);
  expect((await http.patch(base, { json: { monthlyBudget: -5 } })).status).toBe(400);
  expect((await http.patch(base, { json: { aiProvider: "ollama" } })).json.error.code).toBe("AI_LOCAL_MIGRATION_REQUIRED");
  await http.patch(base, { json: { maxConcurrentRuns: 4, maxQueuedRuns: 100 } });
});

test("[fl-workspaces.3] the workspace overview reports flows, runs and the worker for the dashboard", { tags: ["feat:fl-workspaces", "shard:core-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("ws-overview");
  const before = (await http.get(`/api/workspaces/${a.workspaceId}/overview`)).json;
  expect(before.worker.online).toBe(true);
  expect(before).toMatchObject({ pendingApprovals: 0, unhealthyConnections: [], pausedFlows: 0 });
  const f = await newFlow(http, a.workspaceId, `Overview ${seeded("ov", 4)}`, chain({ n: 1 }, "$"));
  const run = await startRun(http, f.id);
  expect(run.status).toBe(202);
  await expect.poll(async () => (await http.get(`/api/workspaces/${a.workspaceId}/overview`)).json.runs24h, { timeout: 30_000 }).toBe(before.runs24h + 1);
  const after = (await http.get(`/api/workspaces/${a.workspaceId}/overview`)).json;
  expect(after.flows).toBe(before.flows + 1);
  expect(after.recent[0].flowName).toBe(f.name);
});

// ── fl-tenancy ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-tenancy.1] another tenant's workspace, flows, runs and settings answer 404 for members of other workspaces and 401 for visitors", { tags: ["feat:fl-tenancy", "shard:core-api", "lvl:api"] }, async () => {
  const A = await actor("tenant-a"), B = await actor("tenant-b");
  const flow = await newFlow(A.http, A.a.workspaceId, `Private ${seeded("tenant-flow", 4)}`, chain({ secret: 1 }, "$"));
  const run = (await startRun(A.http, flow.id)).json.run;
  const w = `/api/workspaces/${A.a.workspaceId}`;
  const reads = [w, `${w}/flows`, `${w}/overview`, `${w}/runs`, `${w}/members`, `${w}/usage`, `${w}/api-keys`, `${w}/audit`, `${w}/connections`, `${w}/knowledge`, `${w}/agents`, `${w}/ai`, `${w}/billing`, `${w}/files`, `${w}/approvals`,
    `/api/flows/${flow.id}`, `/api/flows/${flow.id}/versions`, `/api/flows/${flow.id}/publish`, `/api/flows/${flow.id}/runs`, `/api/runs/${run.id}`, `/api/runs/${run.id}/rerun-preview?fromNodeId=shape`];
  for (const path of reads) {
    expect((await B.http.get(path)).status, `B reads ${path}`).toBe(404);
    expect((await anonymous().get(path)).status, `visitor reads ${path}`).toBe(401);
  }
  expect((await B.http.put(`/api/flows/${flow.id}`, { json: { baseRevision: flow.revision, name: "hijack" } })).status).toBe(404);
  expect((await B.http.del(`/api/flows/${flow.id}`)).status).toBe(404);
  expect((await B.http.post(`/api/flows/${flow.id}/runs`, { json: {} })).status).toBe(404);
  expect((await B.http.post(`/api/runs/${run.id}/cancel`)).status).toBe(404);
  expect((await B.http.post(`${w}/flows`, { json: { name: "intruder" } })).status).toBe(404);
  const mine = (await B.http.get(`/api/workspaces/${B.a.workspaceId}/flows`)).json.flows as { id: string }[];
  expect(mine.some((f) => f.id === flow.id)).toBe(false);
  expect((await A.http.get(`/api/flows/${flow.id}`)).json.flow.name).toBe(flow.name);
});

// ── fl-roles ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-roles.1] a viewer can look but not change: every write answers 403 with the reason", { tags: ["feat:fl-roles", "shard:core-api", "lvl:api"] }, async () => {
  const owner = await actor("roles-owner");
  const viewer = await addMember(owner, "roles-viewer", "viewer");
  const w = `/api/workspaces/${owner.a.workspaceId}`;
  const flow = await newFlow(owner.http, owner.a.workspaceId, `Roles ${seeded("roles-flow", 4)}`, chain({ n: 1 }, "$"));
  expect((await viewer.http.get(`${w}/flows`)).status).toBe(200);
  expect((await viewer.http.get(`${w}/members`)).status).toBe(200);
  expect((await viewer.http.get(`/api/flows/${flow.id}`)).json.role).toBe("viewer");
  const denied: [string, string, unknown?][] = [
    ["post", `${w}/flows`, { name: "nope" }], ["put", `/api/flows/${flow.id}`, { baseRevision: flow.revision, name: "nope" }], ["del", `/api/flows/${flow.id}`], ["post", `/api/flows/${flow.id}/runs`, {}],
    ["post", `/api/flows/${flow.id}/publish`], ["patch", w, { name: "nope" }], ["get", `${w}/api-keys`], ["post", `${w}/invites`, { email: mailOf("x-invite"), role: "viewer" }], ["get", `${w}/invites`],
    ["get", `${w}/audit`], ["post", `${w}/ai/connections`, { provider: "openai", apiKey: "k" }], ["post", `${w}/knowledge`, { name: "n", text: "t" }], ["post", `${w}/agents`, {}],
    ["get", `${w}/billing`], ["post", `${w}/billing/checkout`, { planId: "test_pro" }], ["post", `${w}/connections`, { provider: "slack", fields: {} }],
  ];
  for (const [verb, path, body] of denied) {
    const r = await (viewer.http as any)[verb](path, body === undefined ? {} : { json: body });
    expect(r.status, `${verb.toUpperCase()} ${path}`).toBe(403);
    expect(r.json.error.code).toBe("FORBIDDEN");
  }
  expect((await viewer.http.post(`/api/flows/${flow.id}/runs`, { json: {} })).json.error.message).toMatch(/viewer/);
  expect((await owner.http.get(`/api/flows/${flow.id}`)).json.flow.name).toBe(flow.name);
});

test("[fl-roles.2] an editor builds and runs but cannot manage members, keys, billing or the audit log", { tags: ["feat:fl-roles", "shard:core-api", "lvl:api"] }, async () => {
  const owner = await actor("roles-owner-2");
  const editor = await addMember(owner, "roles-editor", "editor");
  const w = `/api/workspaces/${owner.a.workspaceId}`;
  const flow = await newFlow(editor.http, owner.a.workspaceId, `Editor ${seeded("roles-ed", 4)}`, chain({ n: 1 }, "$"));
  expect((await startRun(editor.http, flow.id)).status).toBe(202);
  expect((await editor.http.get(`${w}/billing`)).status).toBe(200);
  for (const [verb, path, body] of [["patch", w, { name: "nope" }], ["get", `${w}/api-keys`], ["get", `${w}/audit`], ["get", `${w}/invites`], ["post", `${w}/invites`, { email: mailOf("y-invite"), role: "viewer" }],
    ["post", `${w}/billing/checkout`, { planId: "test_pro" }], ["post", `${w}/ai/connections`, { provider: "openai", apiKey: "k" }]] as [string, string, unknown?][]) {
    const r = await (editor.http as any)[verb](path, body === undefined ? {} : { json: body });
    expect(r.status, `${verb.toUpperCase()} ${path}`).toBe(403);
  }
});

// ── fl-members ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-members.1] an invitation is e-mailed, previewed and accepted once by the invited address only", { tags: ["feat:fl-members", "shard:core-api", "lvl:api"] }, async () => {
  const owner = await actor("mem-owner");
  const guest = await actor("mem-guest"), stranger = await actor("mem-stranger");
  const w = `/api/workspaces/${owner.a.workspaceId}`;
  expect((await owner.http.post(`${w}/invites`, { json: { email: guest.a.email, role: "admin" } })).status).toBe(400);
  const inv = await owner.http.post(`${w}/invites`, { json: { email: guest.a.email, role: "editor" } });
  expect(inv.status).toBe(201);
  expect(inv.json.invite).toMatchObject({ email: guest.a.email, role: "editor", status: "pending" });
  const token = String(inv.json.url).split("/invite/")[1]!;
  const mail = await awaitMail(owner.http, guest.a.email, "invite");
  expect(mail.link).toContain(`/invite/${token}`);
  const pending = (await owner.http.get(`${w}/invites`)).json.invites as { id: string; status: string }[];
  expect(pending.find((i) => i.id === inv.json.invite.id)?.status).toBe("pending");
  expect((await guest.http.get(`/api/invites/${token}`)).json).toMatchObject({ workspaceName: owner.a.workspaceName, role: "editor", status: "pending", emailMatches: true });
  const wrong = await stranger.http.post(`/api/invites/${token}`);
  expect(wrong.status).toBe(403);
  expect(wrong.json.error.code).toBe("INVITE_EMAIL_MISMATCH");
  expect((await guest.http.get(`/api/invites/${"A".repeat(40)}`)).status).toBe(404);
  const accepted = await guest.http.post(`/api/invites/${token}`);
  expect(accepted.status).toBe(200);
  expect(accepted.json).toMatchObject({ workspaceId: owner.a.workspaceId, slug: owner.a.slug, role: "editor" });
  expect((await guest.http.post(`/api/invites/${token}`)).json.error.code).toBe("INVITE_USED");
  const members = (await owner.http.get(`${w}/members`)).json.members as { email: string; role: string }[];
  expect(members.find((m) => m.email === guest.a.email)?.role).toBe("editor");
  expect((await owner.http.post(`${w}/invites`, { json: { email: guest.a.email, role: "viewer" } })).json.error.code).toBe("ALREADY_MEMBER");
  const second = await owner.http.post(`${w}/invites`, { json: { email: stranger.a.email, role: "viewer" } });
  const secondToken = String(second.json.url).split("/invite/")[1]!;
  expect((await owner.http.del(`${w}/invites/${second.json.invite.id}`)).status).toBe(200);
  const revoked = await stranger.http.post(`/api/invites/${secondToken}`);
  expect(revoked.status).toBe(410);
  expect(revoked.json.error.code).toBe("INVITE_REVOKED");
  expect((await outbox(owner.http, guest.a.email, "invite")).length).toBeGreaterThan(0);
});

test("[fl-members.2] roles change and members are removed with the last-owner safeguard; removed members lose access at once", { tags: ["feat:fl-members", "shard:core-api", "lvl:api"] }, async () => {
  const owner = await actor("mem2-owner");
  const m = await addMember(owner, "mem2-member", "viewer");
  const w = `/api/workspaces/${owner.a.workspaceId}`;
  expect((await m.http.patch(`${w}/members/${owner.a.userId}`, { json: { role: "viewer" } })).status).toBe(403);
  const up = await owner.http.patch(`${w}/members/${m.a.userId}`, { json: { role: "editor" } });
  expect(up.json).toEqual({ role: "editor" });
  expect((await m.http.get(`/api/workspaces/${owner.a.workspaceId}`)).json.role).toBe("editor");
  expect((await owner.http.patch(`${w}/members/${m.a.userId}`, { json: { role: "boss" } })).status).toBe(400);
  const last = await owner.http.patch(`${w}/members/${owner.a.userId}`, { json: { role: "editor" } });
  expect(last.status).toBe(409);
  expect(last.json.error.code).toBe("LAST_OWNER");
  expect((await owner.http.del(`${w}/members/${owner.a.userId}`)).json.error.code).toBe("LAST_OWNER");
  expect((await owner.http.del(`${w}/members/${m.a.userId}`)).status).toBe(200);
  expect((await m.http.get(`/api/workspaces/${owner.a.workspaceId}`)).status).toBe(404);
  expect((await owner.http.del(`${w}/members/${m.a.userId}`)).status).toBe(404);
});

// ── fl-api-keys ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-api-keys.1] an API key is shown once, listed without its secret, validated and revocable", { tags: ["feat:fl-api-keys", "shard:core-api", "lvl:api"] }, async () => {
  const { a, http } = await actor("keys-owner");
  const w = `/api/workspaces/${a.workspaceId}`;
  const name = `CI key ${seeded("key-name", 4)}`;
  const created = await http.post(`${w}/api-keys`, { json: { name, mode: "test", scopes: ["flows:read", "runs:read"], expiresInDays: 30 } });
  expect(created.status).toBe(201);
  expect(created.headers.get("cache-control")).toBe("no-store");
  const key = created.json.key as string;
  expect(key).toMatch(/^fl_test_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  expect(created.json.apiKey).toMatchObject({ name, mode: "test", status: "active", scopes: ["flows:read", "runs:read"] });
  expect(created.json.apiKey.prefix).toBe(key.slice(0, 16));
  const list = await http.get(`${w}/api-keys`);
  expect(list.text).not.toContain(key);
  expect(Object.keys(list.json.scopes).sort()).toEqual(["agents:run", "flows:read", "runs:read", "runs:write"]);
  expect((list.json.apiKeys as { id: string }[]).some((k) => k.id === created.json.apiKey.id)).toBe(true);
  for (const bad of [{ name: "", mode: "test", scopes: ["flows:read"] }, { name: "k", mode: "test", scopes: [] }, { name: "k", mode: "test", scopes: ["admin:all"] }, { name: "k", mode: "prod", scopes: ["flows:read"] }, { name: "k", mode: "test", scopes: ["flows:read"], expiresInDays: 0 }]) {
    expect((await http.post(`${w}/api-keys`, { json: bad })).status, JSON.stringify(bad)).toBe(400);
  }
  const revoked = await http.del(`${w}/api-keys/${created.json.apiKey.id}`);
  expect(revoked.status).toBe(200);
  expect(revoked.json.apiKey.status).toBe("revoked");
  expect((await http.del(`${w}/api-keys/${seeded("no-such-key", 8)}`)).status).toBe(404);
});

// ── fl-audit-log ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("[fl-audit-log.1] security-relevant changes are recorded with who did them, never with secrets, owner-only", { tags: ["feat:fl-audit-log", "shard:core-api", "lvl:api"] }, async () => {
  const owner = await actor("audit-owner");
  const viewer = await addMember(owner, "audit-viewer", "viewer");
  const w = `/api/workspaces/${owner.a.workspaceId}`;
  const key = await owner.http.post(`${w}/api-keys`, { json: { name: `Audit key ${seeded("audit-key", 4)}`, mode: "live", scopes: ["flows:read"] } });
  await owner.http.patch(`${w}/members/${viewer.a.userId}`, { json: { role: "editor" } });
  await owner.http.patch(`${w}/members/${viewer.a.userId}`, { json: { role: "viewer" } });
  const log = await owner.http.get(`${w}/audit`);
  expect(log.status).toBe(200);
  const events = log.json.events as { action: string; actorLabel: string; targetType: string; data: unknown }[];
  const actions = events.map((e) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["apikey.created", "member.invited", "member.joined", "member.role_changed"]));
  expect(events.find((e) => e.action === "apikey.created")).toMatchObject({ actorLabel: owner.a.email, targetType: "api_key" });
  expect(log.text).not.toContain(key.json.key);
  expect((await viewer.http.get(`${w}/audit`)).status).toBe(403);
  const ids = events.map((e: any) => e.id as number);
  expect([...ids].sort((x, y) => y - x)).toEqual(ids);
  if (log.json.nextBefore) expect((await owner.http.get(`${w}/audit?before=${log.json.nextBefore}`)).status).toBe(200);
});
