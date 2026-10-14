// Issue #145: the Mizano connection type (a per-workspace base URL plus a scoped API key, stored encrypted) and the
// "Test connection" action that verifies a SAVED connection by calling the provider's identity() (for Mizano GET /api/health, then GET /api/me).
//
// Request-level test (AC1: the key is encrypted and never returned; AC2: Test connection checks the saved credentials
// and takes no body, so a caller cannot point the stored key at another host). The UI test then drives the saved
// connection's card: it offers a Test connection control that reports the account. The throwaway stack redirects the
// provider to the fake provider server, so no real Mizano host is contacted; the stored key only ever goes to the
// connection's own saved https origin. Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the
// helpers live here.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
const MIZANO_URL = "https://mizano.example.com";
/** A scoped key the fake provider server accepts (its account "a" is Alice A). */
const KEY = "test-token";
/** Deterministic per stack: derived from a fixed seed and the stack URL, never from the clock. */
const seeded = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("hex").slice(0, 12);
const plain = (base: string) => ({ "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED });

const signIn = (base: string, email: string) =>
  fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ email, password: PASSWORD }) });

/** Polls the test-stack outbox (newest first) for the newest link of one purpose and returns its token. */
async function outboxToken(base: string, email: string, purpose: string) {
  for (let i = 0; i < 24; i++) {
    const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: plain(base) });
    const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
    const link = messages.find((m) => m.purpose === purpose)?.link;
    const token = link ? new URL(link).searchParams.get("token") : null;
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 500)); // the outbox is written after the response
  }
  throw new Error(`no ${purpose} e-mail in the test outbox`);
}

/** A verified, signed-in account through the product's own endpoints; returns request headers carrying its session. */
async function signedIn(base: string, email: string) {
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  if (up.ok) {
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ action: "verify", token: await outboxToken(base, email, "verify") }) });
    expect(v.status).toBe(200);
  }
  const res = await signIn(base, email);
  expect(res.status).toBe(200);
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { ...plain(base), cookie: `${FIXED}; ${session}` };
}

/** A workspace and a saved Mizano connection, created through the product's own endpoints. */
async function savedMizano(base: string, headers: Record<string, string>) {
  const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers, body: JSON.stringify({ name: "Army 145 Mizano" }) });
  expect(created.status).toBe(201);
  const { workspace } = (await created.json()) as { workspace: { id: string; slug: string } };
  const made = await fetch(`${base}/api/workspaces/${workspace.id}/connections`, { method: "POST", headers, body: JSON.stringify({ provider: "mizano", label: "Mizano", fields: { token: KEY, baseUrl: MIZANO_URL } }) });
  const text = await made.text();
  expect(made.status, text).toBe(201);
  return { workspace, text, connection: (JSON.parse(text) as { connection: { id: string; accountLabel: string; settings: Record<string, string> } }).connection };
}

test(
  "@issue-145 AC1/AC2: a saved Mizano connection keeps its scoped key server-side, and Test connection checks only the saved URL",
  { tags: ["feat:fl-connections", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-owner-${seeded(base, "owner")}@flowline-e2e.test`);
    const { workspace, text, connection } = await savedMizano(base, owner);
    // AC1: the key is verified against /api/health + /api/me and stored, but never echoed back.
    expect(text).not.toContain(KEY);
    expect(connection.accountLabel).toBe("Alice A Mizano");
    expect(connection.settings.baseUrl).toBe(MIZANO_URL);
    const list = await fetch(`${base}/api/workspaces/${workspace.id}/connections`, { headers: owner });
    expect(list.status).toBe(200);
    expect(await list.text()).not.toContain(KEY);

    // AC2: Test connection verifies the SAVED credentials and answers with the account, not the key.
    const ok = await fetch(`${base}/api/workspaces/${workspace.id}/connections/${connection.id}/test`, { method: "POST", headers: owner });
    const okText = await ok.text();
    expect(ok.status).toBe(200);
    expect(JSON.parse(okText)).toMatchObject({ ok: true, accountLabel: "Alice A Mizano" });
    expect(okText).not.toContain(KEY);

    // The route takes no body: supplying one cannot point the stored key at another host, and the saved URL is unchanged.
    const spoofed = await fetch(`${base}/api/workspaces/${workspace.id}/connections/${connection.id}/test`, { method: "POST", headers: owner, body: JSON.stringify({ baseUrl: "https://attacker.example" }) });
    expect(spoofed.status).toBe(200);
    const after = await fetch(`${base}/api/workspaces/${workspace.id}/connections`, { headers: owner });
    expect(await after.text()).toContain(MIZANO_URL);

    // A test is a workspace action: without a session it is refused.
    const anon = await fetch(`${base}/api/workspaces/${workspace.id}/connections/${connection.id}/test`, { method: "POST", headers: plain(base) });
    expect(anon.status).toBe(401);
  },
);

// The same shared adapter file also defines Mizano's scoped action, so this PR carries the fl-integration-actions
// coverage: the catalog must expose the new connection type and its action with the scope it needs.
test(
  "@issue-145 catalog: the new Mizano connection type exposes its scoped action with the key it needs",
  { tags: ["feat:fl-integration-actions", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-catalog-${seeded(base, "catalog")}@flowline-e2e.test`);
    const res = await fetch(`${base}/api/integrations/catalog`, { headers: owner });
    expect(res.status).toBe(200);
    const { providers } = (await res.json()) as {
      providers: { id: string; authType: string; connectFields: { key: string; secret: boolean }[]; actions: { id: string; requiredScopes?: string[] }[] }[];
    };
    const mizano = providers.find((p) => p.id === "mizano");
    expect(mizano).toBeDefined();
    expect(mizano!.authType).toBe("api_key");
    // The scoped key is a secret connect field; the host is a plain setting.
    expect(mizano!.connectFields.map((f) => [f.key, f.secret])).toEqual([
      ["token", true],
      ["baseUrl", false],
    ]);
    const action = mizano!.actions.find((a) => a.id === "mizano.list_overdue_invoices");
    expect(action).toBeDefined();
    expect(action!.requiredScopes).toContain("invoices:read");
  },
);

// The Integrations page lives at /w/[slug]/integrations; the workspace layout resolves the slug against the caller's
// membership and 404s a slug they are not a member of (src/app/w/[slug]/layout.tsx:16, requireWorkspaceBySlug). A
// verification run that guessed the slug (e.g. /w/test-workspace/integrations) therefore saw a 404 for a page that is
// reachable. This pins both halves: the owner gets the page, a non-member slug is not found.
test(
  "@issue-145 AC2: the Integrations page is reachable for the workspace owner (and a foreign slug 404s)",
  { tags: ["feat:fl-integrations", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-reach-${seeded(base, "reach")}@flowline-e2e.test`);
    const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers: owner, body: JSON.stringify({ name: "Army 145 Reach" }) });
    expect(created.status).toBe(201);
    const { workspace } = (await created.json()) as { workspace: { slug: string } };
    const page = await fetch(`${base}/w/${workspace.slug}/integrations`, { headers: owner });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    // A workspace the account is not a member of is never confirmed to it: notFound() -> 404.
    const stranger = await signedIn(base, `army-145-reach-out-${seeded(base, "reach-out")}@flowline-e2e.test`);
    const foreign = await fetch(`${base}/w/${workspace.slug}/integrations`, { headers: stranger });
    expect(foreign.status).toBe(404);
  },
);

test(
  "@issue-145 AC2: the saved Mizano connection's card offers a Test connection control that reports the account",
  { tags: ["feat:fl-integrations", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-integrations-${seeded(base, "integrations")}@flowline-e2e.test`);
    const { workspace } = await savedMizano(base, owner);
    // Sign the browser in as the same user so the workspace page resolves; no agent step is needed.
    await browser.setCookies(
      owner.cookie.split("; ").map((pair) => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: base })),
    );
    await app.open(`/w/${workspace.slug}/integrations`);
    const card = screen.getByTestId("connection-mizano");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", "Test connection").tap();
    await expect(screen.getByText(/Connection OK — Alice A Mizano/)).toBeVisible({ timeout: 30_000 });
  },
);
