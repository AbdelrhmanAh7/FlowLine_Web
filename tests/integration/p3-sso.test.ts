import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as ssoCallbackGET } from "@/app/api/sso/callback/route";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/server/access";
import { listAudit } from "@/server/audit";
import { completeSso, getSsoConfig, saveSsoConfig, ssoSessionCookie, startSso } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { startFakeProviders } from "../../e2e/fakes/provider-server";
import { addMember, closeDb, expectHttpError, makeUser, unique } from "./helpers";
import { sessionFor } from "./platform-helpers";
import { confirmSsoLink } from "@/server/sso-link";
import { consumeMailboxLink, proveSsoMailbox } from "./federation-fixture";

const CLIENT_ID = "flowline-test";
const CLIENT_SECRET = "sso-test-secret-not-logged";
const DOMAIN = "flowline.test";
const PASSWORD = "sso-owner-password-123";
const previousBetaMode = process.env.FLOWLINE_BETA_MODE;

let fake: Awaited<ReturnType<typeof startFakeProviders>>;
let issuer: string;

beforeAll(async () => {
  // These SSO journeys test explicitly open registration; missing config must fail closed.
  process.env.FLOWLINE_BETA_MODE = "open";
  fake = await startFakeProviders();
  process.env.FLOWLINE_ENV = "test";
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `${process.env.FLOWLINE_EGRESS_ALLOWLIST ?? ""},127.0.0.1:${fake.port},localhost:${fake.port}`;
  issuer = `${fake.url}/oidc`;
});

afterAll(async () => {
  if (previousBetaMode === undefined) delete process.env.FLOWLINE_BETA_MODE;
  else process.env.FLOWLINE_BETA_MODE = previousBetaMode;
  await fake.close();
  await closeDb();
});

/** POST to the fake's control API. */
async function control(path: string, body: unknown) {
  const res = await fetch(`${fake.url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`control ${path} failed: ${res.status}`);
}

async function setFakeUser(email: string, emailVerified = true) {
  await control("/__fake/oidc/user", { email, email_verified: emailVerified });
}

async function workspaceWithSso(opts: { defaultRole?: "viewer" | "editor" | "owner"; domains?: string[] } = {}) {
  const owner = await makeUser("sso-own");
  const ws = await createWorkspace(owner, unique("SsoWs"));
  const config = await saveSsoConfig(owner, ws.id, {
    issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    domains: opts.domains ?? [DOMAIN],
    defaultRole: opts.defaultRole ?? "editor",
    enabled: false,
  });
  return { owner, ws, config };
}

/** Drives the whole redirect flow: start → fake authorize → complete. */
async function runSignIn(slug: string, opts: { user?: CurrentUser | null; email?: string; confirmLink?: boolean } = {}) {
  const session = opts.user ? await sessionFor(opts.user) : undefined;
  const { url, state } = await startSso({ slug, email: opts.email, user: opts.user === undefined ? null : opts.user, sessionToken: session?.token });
  const res = await fetch(url, { redirect: "manual" });
  expect(res.status).toBe(302);
  const loc = new URL(res.headers.get("location")!);
  const code = loc.searchParams.get("code");
  expect(code).toBeTruthy();
  const result = await completeSso({ state, code: code!, sessionToken: session?.token });
  if (opts.confirmLink && result.linkRequired && session) {
    await proveSsoMailbox(result.linkRequired, session);
    await confirmSsoLink(result.linkRequired, session.token, { password: PASSWORD });
    return runSignIn(slug);
  }
  return result;
}

/** Legitimate SSO identities start with independent Flowline mailbox ownership. */
async function registerAndLink(ws: { id: string; slug: string }, email: string, role: "viewer" | "editor" | "owner" = "editor") {
  const signup = await auth.api.signUpEmail({ body: { email, name: "SSO member", password: PASSWORD } });
  expect(signup.token).toBeNull();
  await consumeMailboxLink(email);
  await addMember(ws.id, signup.user.id, role);
  await setFakeUser(email);
  return runSignIn(ws.slug, { user: signup.user, confirmLink: true });
}

async function enableSso(owner: CurrentUser, ws: { id: string; slug: string }) {
  await runSignIn(ws.slug, { user: owner });
  return saveSsoConfig(owner, ws.id, { issuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: true });
}

/** Proves the issued cookie is accepted by better-auth's own session lookup. */
async function sessionFromCookie(token: string) {
  const cookie = await ssoSessionCookie(token);
  const headers = new Headers({ cookie: `${cookie.name}=${encodeURIComponent(cookie.value)}` });
  return auth.api.getSession({ headers });
}

async function membership(workspaceId: string, userId: string) {
  const [m] = await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  return m ?? null;
}

describe("sso configuration", () => {
  it("uses ZITADEL Basic client authentication with PKCE and preserves the selected provider", async () => {
    const owner = await makeUser("zitadel-own");
    const ws = await createWorkspace(owner, unique("ZitadelWs"));
    const config = await saveSsoConfig(owner, ws.id, {
      issuer: `${fake.url}/zitadel`, provider: "zitadel", clientId: "flowline@tenant",
      clientSecret: "secret:with!symbols", domains: [DOMAIN], defaultRole: "viewer", enabled: false,
    });
    expect(config.provider).toBe("zitadel");
    await setFakeUser(`zitadel-${randomUUID().slice(0, 8)}@${DOMAIN}`);
    const result = await runSignIn(ws.slug, { user: owner });
    expect(result.testSignIn).toBe(true);
    expect(result.newUser).toBe(false);
    expect(result.configurationVerified).toBe(true);
    expect(result.sessionToken).toBe("");
    expect((await getSsoConfig(owner, ws.id))?.verifiedAt).not.toBeNull();
    await saveSsoConfig(owner, ws.id, { issuer: `${fake.url}/zitadel`, provider: "zitadel", clientId: "flowline@tenant", domains: [DOMAIN], defaultRole: "viewer", enabled: true });
  });

  it("saves an encrypted config without the secret in reads or audit; enabling before a test sign-in is refused", async () => {
    const { owner, ws, config } = await workspaceWithSso();
    expect(config.verifiedAt).toBeNull();
    expect(config.hasSecret).toBe(true);
    expect(config.enabled).toBe(false);

    // The client projection and the audit trail never contain the secret.
    const read = await getSsoConfig(owner, ws.id);
    expect(read).not.toBeNull();
    expect(JSON.stringify(read)).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(read)).not.toContain("clientSecretEnc");
    const events = (await listAudit(db, ws.id)).events;
    expect(events.map((e) => e.action)).toContain("sso.configured");
    expect(JSON.stringify(events)).not.toContain(CLIENT_SECRET);
    // The stored ciphertext decrypts back to the secret only server-side.
    const [row] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id));
    expect(row!.clientSecretEnc).not.toContain(CLIENT_SECRET);

    await expectHttpError(saveSsoConfig(owner, ws.id, { issuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "viewer", enabled: true }), 400, "SSO_UNVERIFIED");
  });

  it("rejects a non-https issuer (outside the test allowlist), a missing secret, and bad domains", async () => {
    const owner = await makeUser("sso-bad");
    const ws = await createWorkspace(owner, unique("SsoBad"));
    await expectHttpError(saveSsoConfig(owner, ws.id, { issuer: "http://idp.example.com", clientId: "c", clientSecret: "s", domains: [DOMAIN], defaultRole: "viewer", enabled: false }), 400, "VALIDATION");
    await expectHttpError(saveSsoConfig(owner, ws.id, { issuer, clientId: "c", domains: [DOMAIN], defaultRole: "viewer", enabled: false }), 400, "VALIDATION");
    await expectHttpError(saveSsoConfig(owner, ws.id, { issuer, clientId: "c", clientSecret: "s", domains: ["not a domain"], defaultRole: "viewer", enabled: false }), 400, "VALIDATION");
  });

  it("non-owners can't save: editors get 403, strangers get 404", async () => {
    const { ws } = await workspaceWithSso();
    const editor = await makeUser("sso-ed");
    await addMember(ws.id, editor.id, "editor");
    const stranger = await makeUser("sso-str");
    const input = { issuer, clientId: CLIENT_ID, clientSecret: "x", domains: [DOMAIN], defaultRole: "viewer" as const, enabled: false };
    await expectHttpError(saveSsoConfig(editor, ws.id, input), 403, "FORBIDDEN");
    await expectHttpError(saveSsoConfig(stranger, ws.id, input), 404, "NOT_FOUND");
  });

  it("changing issuer or client id clears verification", async () => {
    const { owner, ws } = await workspaceWithSso();
    await setFakeUser(`ada-${randomUUID().slice(0, 8)}@${DOMAIN}`);
    const stranger = await makeUser("sso-never");
    await expectHttpError(startSso({ slug: ws.slug, user: stranger }), 400, "SSO_NOT_CONFIGURED");
    await runSignIn(ws.slug, { user: owner });
    let [row] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id));
    expect(row!.verifiedAt).not.toBeNull();
    const updated = await saveSsoConfig(owner, ws.id, { issuer, clientId: "other-client", domains: [DOMAIN], defaultRole: "editor", enabled: false });
    expect(updated.verifiedAt).toBeNull();
    [row] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id));
    expect(row!.verifiedAt).toBeNull();
  });
});

describe("sso sign-in", () => {
  it("happy path: the owner verifies configuration without provisioning an identity; a mailbox-confirmed member gets the default role and a real session", async () => {
    const { owner, ws } = await workspaceWithSso({ defaultRole: "editor" });
    const email = `ada-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    await setFakeUser(email);

    // A non-owner can't even start while SSO is disabled; the owner runs the test sign-in.
    await expectHttpError(startSso({ slug: ws.slug, user: null }), 400, "SSO_NOT_CONFIGURED");
    const tested = await runSignIn(ws.slug, { user: owner });
    expect(tested.newUser).toBe(false);
    expect(tested.newMember).toBe(false);
    expect(tested.testSignIn).toBe(true);
    expect(tested.configurationVerified).toBe(true);
    expect(tested.sessionToken).toBe("");
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(0);
    await saveSsoConfig(owner, ws.id, { issuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: true });
    const linked = await registerAndLink(ws, email);
    // A prior approved binding cannot undo an owner's removal of membership.
    await db.delete(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, linked.user.id)));
    await expectHttpError(runSignIn(ws.slug), 403, "SSO_LINK_INVALID");
    expect(await membership(ws.id, linked.user.id)).toBeNull();
    // Explicitly re-granting access restores sign-in and preserves that role.
    await addMember(ws.id, linked.user.id, "editor");
    const result = await runSignIn(ws.slug);
    expect(result.newUser).toBe(false);
    expect(result.newMember).toBe(false);
    expect(result.testSignIn).toBe(false);

    const [cfg] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id));
    expect(cfg!.verifiedAt).not.toBeNull();
    const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    expect(user!.emailVerified).toBe(true);
    expect((await membership(ws.id, user!.id))!.role).toBe("editor");

    const session = await sessionFromCookie(result.sessionToken);
    expect(session?.user.email).toBe(email);
    const events = (await listAudit(db, ws.id)).events;
    expect(events.map((e) => e.action)).toContain("sso.signin");
    expect(JSON.stringify(events)).not.toContain(CLIENT_SECRET);
  });

  it("once verified the config can be enabled; an existing member then signs in and keeps their role", async () => {
    const { owner, ws } = await workspaceWithSso({ defaultRole: "editor" });
    await setFakeUser(`founder-${randomUUID().slice(0, 8)}@${DOMAIN}`);
    await runSignIn(ws.slug, { user: owner }); // verifies
    const enabled = await saveSsoConfig(owner, ws.id, { issuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: true });
    expect(enabled.enabled).toBe(true);
    expect(enabled.verifiedAt).not.toBeNull();

    // A mailbox-confirmed SSO user signs in again → the same account, keeping a changed role.
    const email = `carol-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    await setFakeUser(email);
    const first = await registerAndLink(ws, email);
    expect(first.newUser).toBe(false);
    await db.update(schema.workspaceMember).set({ role: "viewer" }).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, first.user.id)));
    const again = await runSignIn(ws.slug, { user: null });
    expect(again.user.id).toBe(first.user.id);
    expect(again.newUser).toBe(false);
    expect(again.newMember).toBe(false);
    expect((await membership(ws.id, first.user.id))!.role).toBe("viewer");
    expect((await sessionFromCookie(again.sessionToken))?.user.id).toBe(first.user.id);
  });

  it("never takes over an existing account by email — not a password user, not another workspace's SSO user", async () => {
    const { owner, ws } = await workspaceWithSso();
    await setFakeUser(`founder-${randomUUID().slice(0, 8)}@${DOMAIN}`);
    await runSignIn(ws.slug, { user: owner });
    await saveSsoConfig(owner, ws.id, { issuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: true });

    // A pre-existing (password) user, even a member of this workspace, with a mixed-case email.
    const email = `Bob-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    const bobId = randomUUID();
    await db.insert(schema.user).values({ id: bobId, email, name: "Bob" });
    await addMember(ws.id, bobId, "viewer");
    await setFakeUser(email.toLowerCase());
    const sessionsBefore = (await db.select().from(schema.session).where(eq(schema.session.userId, bobId))).length;
    await expectHttpError(runSignIn(ws.slug, { user: owner }), 409, "SSO_ACCOUNT_EXISTS");
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, bobId))).toHaveLength(sessionsBefore);

    // A user confirmed under workspace A's IdP can't be claimed by workspace B's IdP asserting the same email.
    const userEmail = `dora-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    await setFakeUser(userEmail);
    const a = await registerAndLink(ws, userEmail);
    const other = await workspaceWithSso();
    await enableSso(other.owner, other.ws);
    await expectHttpError(runSignIn(other.ws.slug), 409, "SSO_ACCOUNT_EXISTS");
    expect(await membership(other.ws.id, a.user.id)).toBeNull();
  });

  it("links don't survive a change of IdP: a new issuer can't sign in as a user linked under the old one (Codex CX3-01)", async () => {
    const { owner, ws } = await workspaceWithSso();
    const email = `linked-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    await setFakeUser(email);
    await enableSso(owner, ws);
    const linked = await registerAndLink(ws, email);
    expect((await runSignIn(ws.slug, { user: null })).user.id).toBe(linked.user.id);

    // The owner re-points SSO at another IdP (same fake, different issuer identity) that asserts the same subject.
    const otherIssuer = issuer.replace("127.0.0.1", "localhost");
    expect(otherIssuer).not.toBe(issuer);
    await saveSsoConfig(owner, ws.id, { issuer: otherIssuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: false });
    await setFakeUser(`owner-verify-${randomUUID().slice(0, 8)}@${DOMAIN}`);
    await runSignIn(ws.slug, { user: owner }); // re-verify with a fresh identity
    await saveSsoConfig(owner, ws.id, { issuer: otherIssuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: true });
    await setFakeUser(email);
    const sessionsBefore = (await db.select().from(schema.session).where(eq(schema.session.userId, linked.user.id))).length;
    await expectHttpError(runSignIn(ws.slug, { user: null }), 409, "SSO_ACCOUNT_EXISTS");
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, linked.user.id))).toHaveLength(sessionsBefore);
  });

  it("the account holder can link their existing account only after explicit confirmation while signed in", async () => {
    const { owner, ws } = await workspaceWithSso();
    // The owner's own email is in the SSO domain: verification tests never link implicitly.
    const [ownerRow] = await db.select().from(schema.user).where(eq(schema.user.id, owner.id));
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    await db.update(schema.user).set({ email: ownerEmail }).where(eq(schema.user.id, ownerRow!.id));
    owner.email = ownerEmail;
    await setFakeUser(ownerEmail);
    await enableSso(owner, ws);
    const linked = await runSignIn(ws.slug, { user: owner, confirmLink: true });
    expect(linked.user.id).toBe(owner.id);
    expect(linked.newUser).toBe(false);
    expect((await membership(ws.id, owner.id))!.role).toBe("owner");
    // From then on the link alone identifies them, even when not signed in.
    await saveSsoConfig(owner, ws.id, { issuer, clientId: CLIENT_ID, domains: [DOMAIN], defaultRole: "editor", enabled: true });
    expect((await runSignIn(ws.slug, { user: null })).user.id).toBe(owner.id);
  });

  it("refuses a replayed or expired state", async () => {
    const { owner, ws } = await workspaceWithSso();
    await setFakeUser(`ada-${randomUUID().slice(0, 8)}@${DOMAIN}`);
    const session = await sessionFor(owner);
    const { url, state } = await startSso({ slug: ws.slug, user: owner, sessionToken: session.token });
    const res = await fetch(url, { redirect: "manual" });
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    await completeSso({ state, code, sessionToken: session.token });
    await expectHttpError(completeSso({ state, code }), 400, "SSO_STATE_INVALID");

    const second = await startSso({ slug: ws.slug, user: owner });
    await db.update(schema.ssoState).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.ssoState.state, second.state));
    await expectHttpError(completeSso({ state: second.state, code: "anything" }), 400, "SSO_STATE_INVALID");
  });

  for (const mode of ["bad_signature", "wrong_aud", "wrong_iss", "expired", "bad_nonce"] as const) {
    it(`refuses a tampered id_token (${mode}) with no session and no membership`, async () => {
      const { owner, ws } = await workspaceWithSso();
      const email = `tamper-${mode}-${randomUUID().slice(0, 8)}@${DOMAIN}`;
      await setFakeUser(email);
      await control("/__fake/oidc/tamper", { mode });
      await expectHttpError(runSignIn(ws.slug, { user: owner }), 400, "SSO_TOKEN_INVALID");
      const users = await db.select().from(schema.user).where(eq(schema.user.email, email));
      expect(users).toHaveLength(0);
      const members = await db.select().from(schema.workspaceMember).where(eq(schema.workspaceMember.workspaceId, ws.id));
      expect(members).toHaveLength(1); // just the owner
      const [cfg] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id));
      expect(cfg!.verifiedAt).toBeNull();
    });
  }

  it("refuses an unverified email and an email outside the allowed domains", async () => {
    const { owner, ws } = await workspaceWithSso();
    await setFakeUser(`eve@${DOMAIN}`, false);
    await expectHttpError(runSignIn(ws.slug, { user: owner }), 400, "SSO_TOKEN_INVALID");

    await setFakeUser(`mallory@evil-${randomUUID().slice(0, 6)}.com`);
    await expectHttpError(runSignIn(ws.slug, { user: owner }), 400, "SSO_TOKEN_INVALID");
    const members = await db.select().from(schema.workspaceMember).where(eq(schema.workspaceMember.workspaceId, ws.id));
    expect(members).toHaveLength(1);
  });

  it("refuses to start for unknown workspaces, missing configs, and non-owners while disabled", async () => {
    const { owner, ws } = await workspaceWithSso();
    await expectHttpError(startSso({ slug: "no-such-workspace", user: null }), 400, "SSO_NOT_CONFIGURED");
    const plainOwner = await makeUser("sso-plain");
    const plain = await createWorkspace(plainOwner, unique("NoSso"));
    await expectHttpError(startSso({ slug: plain.slug, user: null }), 400, "SSO_NOT_CONFIGURED");
    const member = await makeUser("sso-mem");
    await addMember(ws.id, member.id, "editor");
    await expectHttpError(startSso({ slug: ws.slug, user: member }), 400, "SSO_NOT_CONFIGURED");
    await expectHttpError(startSso({ slug: ws.slug, user: null }), 400, "SSO_NOT_CONFIGURED");
    await expect(startSso({ slug: ws.slug, user: owner })).resolves.toMatchObject({ testSignIn: true });
  });

  it("the callback route sets a session cookie that better-auth accepts, and redirects errors to sign-in", async () => {
    const { owner, ws } = await workspaceWithSso();
    const email = `route-${randomUUID().slice(0, 8)}@${DOMAIN}`;
    await setFakeUser(email);
    await enableSso(owner, ws);
    await registerAndLink(ws, email);
    const { url, state } = await startSso({ slug: ws.slug, user: null });
    const authRes = await fetch(url, { redirect: "manual" });
    const code = new URL(authRes.headers.get("location")!).searchParams.get("code")!;

    const callback = `http://localhost/api/sso/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`;
    // Started in another browser (no/different state cookie) → refused, and the state is still unused.
    const foreign = await ssoCallbackGET(new Request(callback, { headers: { cookie: "fl_sso_state=someone-elses" } }));
    expect(foreign.headers.get("location")).toContain("/sign-in?sso_error=");
    expect(foreign.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token=");
    const res = await ssoCallbackGET(new Request(callback, { headers: { cookie: `fl_sso_state=${state}` } }));
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain(`/w/${ws.slug}/flows`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token=");
    const pair = setCookie.split(";")[0]!;
    const session = await auth.api.getSession({ headers: new Headers({ cookie: pair }) });
    expect(session?.user.email).toBe(email);

    const bad = await ssoCallbackGET(new Request("http://localhost/api/sso/callback?state=nope&code=nope", { headers: { cookie: "fl_sso_state=nope" } }));
    expect(bad.headers.get("location")).toContain("/sign-in?sso_error=");
    // Provider error text isn't reflected verbatim onto the sign-in page.
    const spoof = await ssoCallbackGET(new Request("http://localhost/api/sso/callback?error=" + encodeURIComponent("Your account is locked, call +1 555")));
    expect(decodeURIComponent(spoof.headers.get("location")!)).not.toContain("call +1 555");
  });
});
