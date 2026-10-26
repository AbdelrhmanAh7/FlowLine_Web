// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// Issue #148: the catalog also offers Mizano's "List overdue invoices" action.
// Issue #364: verify localization in both languages for the Mizano integration catalog.
// Issue #301 (Mizano connection type and Test connection): saved connection keeps secret encrypted, Test connection verifies credentials.
// Issue #365: verify Arabic localization for Mizano integration and clean locale teardown.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
const MIZANO_URL = "https://mizano.example.com";
const KEY = "test-token";
const seeded = (base: string, seed: string) => createHash("sha256").update(`${base}|${seed}`).digest("hex").slice(0, 12);
const plain = (base: string) => ({ "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED });

const signIn = (base: string, email: string) =>
  fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ email, password: PASSWORD }) });

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

async function signedIn(base: string, email: string) {
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: plain(base), body: JSON.stringify({ action: "verify", token: await outboxToken(base, email, "verify") }) });
    expect(v.status).toBe(200);
  }
  const res = await signIn(base, email);
  expect(res.status).toBe(200);
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { ...plain(base), cookie: `${FIXED}; ${session}` };
}

async function onboard(base: string, headers: Record<string, string>) {
  const res = await fetch(`${base}/api/onboarding`, { method: "POST", headers, body: JSON.stringify({ goal: "sales", skipped: false }) });
  expect(res.status).toBe(200);
}

async function savedMizano(base: string, headers: Record<string, string>) {
  const created = await fetch(`${base}/api/workspaces`, { method: "POST", headers, body: JSON.stringify({ name: "Army 301 Mizano" }) });
  expect(created.status).toBe(201);
  const { workspace } = (await created.json()) as { workspace: { id: string; slug: string } };
  const made = await fetch(`${base}/api/workspaces/${workspace.id}/connections`, { method: "POST", headers, body: JSON.stringify({ provider: "mizano", label: "Mizano", fields: { token: KEY, baseUrl: MIZANO_URL } }) });
  const text = await made.text();
  expect(made.status, text).toBe(201);
  return { workspace, text, connection: (JSON.parse(text) as { connection: { id: string; accountLabel: string; settings: Record<string, string> } }).connection };
}

const browserCookies = (base: string, cookie: string, locale: "en" | "ar") =>
  cookie.split("; ").map((pair) => {
    const name = pair.slice(0, pair.indexOf("="));
    return { name, value: name === "fl_locale" ? locale : pair.slice(pair.indexOf("=") + 1), url: base };
  });

test(
  "@issue-301 AC1/AC2: a saved Mizano connection keeps its scoped key server-side, and Test connection checks only the saved URL",
  { tags: ["feat:fl-connections", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-301-owner-${seeded(base, "owner")}@flowline-e2e.test`);
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

test(
  "@issue-301 AC2: the saved Mizano connection's card offers a Test connection control that reports the account",
  { tags: ["feat:fl-integrations", "feat:fl-sign-in", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-301-integrations-${seeded(base, "integrations")}@flowline-e2e.test`);
    const { workspace } = await savedMizano(base, owner);
    await onboard(base, owner);
    await browser.setCookies(browserCookies(base, owner.cookie, "en"));
    await app.open(`/w/${workspace.slug}/integrations`);
    const card = screen.getByTestId("connection-mizano");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", "Test connection").tap();
    await expect(screen.getByText(/Connection OK — Alice A Mizano/)).toBeVisible({ timeout: 30_000 });
  },
);

test(
  "@issue-301 AC2 Arabic: the Test connection control and its OK result are translated and the page is right-to-left",
  { tags: ["feat:fl-i18n-rtl", "feat:fl-integrations", "lvl:ui"] },
  async ({ app, screen, browser }) => {
    const base = app.baseUrl!;
    const owner = await signedIn(base, `army-301-integrations-ar-${seeded(base, "integrations-ar")}@flowline-e2e.test`);
    const { workspace } = await savedMizano(base, owner);
    await onboard(base, owner);
    await browser.setCookies(browserCookies(base, owner.cookie, "ar"));
    await app.open(`/w/${workspace.slug}/integrations`);
    const card = screen.getByTestId("connection-mizano");
    await expect(card).toBeVisible({ timeout: 30_000 });
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await card.getByRole("button", "اختبار الاتصال").tap();
    await expect(screen.getByText(/الاتصال سليم — Alice A Mizano/)).toBeVisible({ timeout: 30_000 });
  },
);

test(
  "@issue-147 AC1: the integrations catalog lists Mizano with the Create customer and Create draft quote actions",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    await agent.assert("the Mizano integration lists an action named Create customer");
    await agent.assert("the Mizano integration lists an action named Create draft quote");
    await expect(screen.getByText("Create customer").first()).toBeVisible();
    await expect(screen.getByText("Create draft quote").first()).toBeVisible();
  },
);

test(
  "@issue-148 AC1: the integrations catalog lists Mizano with the List overdue invoices action",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    await agent.assert("the Mizano integration lists an action named List overdue invoices");
    await expect(screen.getByText("List overdue invoices").first()).toBeVisible();
  },
);

test(
  "@issue-364 AC1: the Mizano integration catalog shows Arabic action titles and RTL layout when language is Arabic",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    // Set locale to Arabic
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
    await app.open("/");
    // Verify RTL layout
    await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("rtl");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    // Verify Arabic action titles (diacritic-resilient matching for shaddah U+0651)
    await agent.assert("the Mizano integration lists an action named إنشاء عميل");
    await agent.assert("the Mizano integration lists an action named إنشاء عرض أسعار مسودّ?ة");
    await agent.assert("the Mizano integration lists an action named عرض الفواتير المتأخرة");
    await expect(screen.getByText("إنشاء عميل").first()).toBeVisible();
    await expect(screen.getByText(/إنشاء عرض أسعار مسودّ?ة/).first()).toBeVisible();
    await expect(screen.getByText("عرض الفواتير المتأخرة").first()).toBeVisible();
    // Verify Arabic category and description
    await agent.assert("the Mizano integration shows category أدوات المحاسبة");
    await agent.assert("the Mizano integration description mentions موصل المحاسبة Mizano");
  },
);

test(
  "@issue-364 AC2: the Mizano integration catalog shows English action titles when language is English",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    // Set locale to English
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/");
    // Verify LTR layout
    await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("ltr");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    // Verify English action titles (regression check)
    await agent.assert("the Mizano integration lists an action named Create customer");
    await agent.assert("the Mizano integration lists an action named Create draft quote");
    await agent.assert("the Mizano integration lists an action named List overdue invoices");
    await expect(screen.getByText("Create customer").first()).toBeVisible();
    await expect(screen.getByText("Create draft quote").first()).toBeVisible();
    await expect(screen.getByText("List overdue invoices").first()).toBeVisible();
    // Verify English category and description
    await agent.assert("the Mizano integration shows category Finance");
    await agent.assert("the Mizano integration description mentions Mizano accounting connector");
  },
);

test(
  "@issue-365 AC1: Mizano integration in Arabic shows localized provider and action details with RTL layout and clean locale teardown",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    try {
      // Set locale to Arabic
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
      await app.open("/");
      // Verify RTL layout
      await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("rtl");
      await agent.act("open the workspace's Integrations page from the navigation");
      await agent.act("open the Mizano integration");
      // Verify Arabic description and action listing
      await agent.assert("the Mizano integration description mentions موصل المحاسبة Mizano");
      await agent.assert("the Mizano integration lists an action named إنشاء عميل");
      await expect(screen.getByText("إنشاء عميل").first()).toBeVisible();
    } finally {
      // Restore locale to English to prevent test pollution
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    }
  },
);


