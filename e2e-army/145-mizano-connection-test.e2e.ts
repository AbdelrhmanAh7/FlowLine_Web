// Issue #145: the Mizano connection type (a per-workspace base URL plus a scoped API key, stored encrypted) and the
// "Test connection" action that verifies a SAVED connection by calling the provider's identity() (for Mizano GET /api/health, then GET /api/me).
//
// Request-level test (AC1: the key is encrypted and never returned; AC2: Test connection checks the saved credentials
// and takes no body, so a caller cannot point the stored key at another host). The UI tests then open Integrations through
// the slug-free /app/integrations and drive the saved connection's card, in English and in Arabic (RTL): it offers a Test
// connection control that reports the account. The throwaway stack redirects the
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
  let token = null as string | null;
  await expect.poll(async () => {
    const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: plain(base) });
    const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
    const link = messages.find((m) => m.purpose === purpose)?.link;
    token = link ? new URL(link).searchParams.get("token") : null;
    return token !== null;
  }, { timeout: 12_000, interval: 250, message: `no ${purpose} e-mail in the test outbox` }).toBe(true);
  return token!;
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

/** Finishes onboarding as the wizard does, so /app and /app/integrations route into the workspace, not to /onboarding. */
async function onboard(base: string, headers: Record<string, string>) {
  const res = await fetch(`${base}/api/onboarding`, { method: "POST", headers, body: JSON.stringify({ goal: "sales", skipped: false }) });
  expect(res.status).toBe(200);
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

// The verify runs opened the route template /w/[slug]/integrations as a literal URL (an earlier one guessed
// /w/test-workspace/integrations). Pages under /w/<slug> resolve the slug against the caller's membership and 404 any other
// (src/app/w/[slug]/layout.tsx, requireWorkspaceBySlug), so Integrations could not be reached without the member's real slug.
// /app/integrations is the slug-free entry, as /app is for Flows: it sends a signed-in, onboarded member to their
// workspace's Integrations page, and a signed-out caller to sign-in.
test(
  "@issue-145 AC2: /app/integrations opens the member's Integrations page without the workspace slug (a foreign slug 404s)",
  { tags: ["feat:fl-integrations", "feat:fl-sign-in", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-reach-${seeded(base, "reach")}@flowline-e2e.test`);
    const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers: owner, body: JSON.stringify({ name: "Army 145 Reach" }) });
    expect(created.status).toBe(201);
    const { workspace } = (await created.json()) as { workspace: { slug: string } };
    await onboard(base, owner);
    // new URL(): the runner's baseUrl ends in "/", and a "//app/…" path is answered by Next's own 308 to the clean path.
    const entry = await fetch(new URL("/app/integrations", base), { headers: owner, redirect: "manual" });
    expect(entry.status).toBe(307);
    expect(new URL(entry.headers.get("location") ?? "", base).pathname).toBe(`/w/${workspace.slug}/integrations`);
    const page = await fetch(new URL(`/w/${workspace.slug}/integrations`, base), { headers: owner, redirect: "manual" });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const anon = await fetch(new URL("/app/integrations", base), { headers: plain(base), redirect: "manual" });
    expect(anon.status).toBe(307);
    expect(new URL(anon.headers.get("location") ?? "", base).pathname).toBe("/sign-in");
    // A workspace the account is not a member of is never confirmed to it: notFound() -> 404.
    const stranger = await signedIn(base, `army-145-reach-out-${seeded(base, "reach-out")}@flowline-e2e.test`);
    const foreign = await fetch(new URL(`/w/${workspace.slug}/integrations`, base), { headers: stranger, redirect: "manual" });
    expect(foreign.status).toBe(404);
  },
);

/** The browser's cookies for a session's `cookie` header in one UI language, so no agent step has to sign in. */
const browserCookies = (base: string, cookie: string, locale: "en" | "ar") =>
  cookie.split("; ").map((pair) => {
    const name = pair.slice(0, pair.indexOf("="));
    return { name, value: name === "fl_locale" ? locale : pair.slice(pair.indexOf("=") + 1), url: base };
  });

test(
  "@issue-145 AC2: the saved Mizano connection's card offers a Test connection control that reports the account",
  { tags: ["feat:fl-integrations", "feat:fl-sign-in", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-integrations-${seeded(base, "integrations")}@flowline-e2e.test`);
    await savedMizano(base, owner);
    await onboard(base, owner);
    await browser.setCookies(browserCookies(base, owner.cookie, "en"));
    await app.open("/app/integrations");
    const card = screen.getByTestId("connection-mizano");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", "Test connection").tap();
    await expect(screen.getByText(/Connection OK — Alice A Mizano/)).toBeVisible({ timeout: 30_000 });
  },
);

test(
  "@issue-145 AC2 Arabic: the Test connection control and its OK result are translated and the page is right-to-left",
  { tags: ["feat:fl-i18n-rtl", "feat:fl-integrations", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-145-integrations-ar-${seeded(base, "integrations-ar")}@flowline-e2e.test`);
    await savedMizano(base, owner);
    await onboard(base, owner);
    await browser.setCookies(browserCookies(base, owner.cookie, "ar"));
    await app.open("/app/integrations");
    const card = screen.getByTestId("connection-mizano");
    await expect(card).toBeVisible({ timeout: 30_000 });
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await card.getByRole("button", "اختبار الاتصال").tap();
    await expect(screen.getByText(/الاتصال سليم — Alice A Mizano/)).toBeVisible({ timeout: 30_000 });
  },
);
