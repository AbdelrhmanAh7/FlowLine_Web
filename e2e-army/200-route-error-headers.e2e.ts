// Issues #200 and #179: the error/rejection boundary of route() and of GET /api/platform/copy. Request-level (no model).
//
// #200 AC: route() error responses carry Cache-Control: no-store and Referrer-Policy: no-referrer.
// #179 AC1: GET /api/platform/copy (getCopyEditorState) never leaks state or an internal error to a non-admin caller.
// Both tests hit /api/platform/copy as an anonymous caller and share the feat:fl-platform-admin tag.
//
// The two files were merged into one to stay within the hub's cap of 8 top-level e2e-army/*.e2e.ts files: the hub's
// verify job copies readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8) (nql-agents src/lib/e2earmy.ts) and
// the #166 MENA-template test is the ninth file, so tests/unit/e2e-army-tooling.test.ts asserts the repo stays at <= 8.
// Merging keeps every test and tag, with no extra session setup.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-200 AC1: error responses of route() are no-store and no-referrer",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const platform = await fetch(new URL("/api/platform/copy", app.baseUrl));
    expect(platform.status).toBe(404);
    expect(platform.headers.get("cache-control")).toBe("no-store");
    expect(platform.headers.get("referrer-policy")).toBe("no-referrer");

    const me = await fetch(new URL("/api/me", app.baseUrl));
    expect(me.status).toBe(401);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(me.headers.get("referrer-policy")).toBe("no-referrer");
  },
);

test("@issue-179 AC1: an anonymous caller gets 404 and no copy state", { tags: ["feat:fl-platform-admin", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(new URL("/api/platform/copy", app.baseUrl));
  expect(res.status).toBe(404);
  const text = await res.text();
  expect(text).not.toContain("draft");
  expect(text).not.toContain("published");
});

test("@issue-166 AC1: the templates gallery shows 'ETA Invoice Notify' and Use template creates a flow from it", { session: "fl-user", tags: ["feat:fl-templates", "lvl:ui"] }, async ({ app, screen, browser }) => {
  await app.open("/app");
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
  const slug = new URL(await browser.url()).pathname.split("/")[2]!;
  await app.open(`/w/${slug}/templates`);
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/templates$/);
  const card = screen.getByTestId("template-eta-invoice-notify");
  await expect(card).toBeVisible();
  await expect(card).toContainText("ETA Invoice Notify");
  await expect(card).toContainText("A batch of invoices, each with a number, a customer, a total and a status.");
  await expect(card).toContainText("The invoices waiting for ETA submission, or a note that none are waiting.");
  await card.getByRole("button", "Use template").click();
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows\/[0-9a-f-]{36}$/);
  await expect(screen.getByLabel("Flow name")).toHaveValue("ETA Invoice Notify");
  await expect(screen.getByText("Pick waiting invoices")).toBeVisible();
});

test("@issue-166 AC1: an unknown template id is rejected and creates no flow", { session: "fl-user", tags: ["feat:fl-templates", "lvl:api"] }, async ({ app, browser }) => {
  await app.open("/app");
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
  const status = await browser.evaluate(async () => {
    const me = await (await fetch("/api/me")).json();
    const slug = location.pathname.split("/")[2];
    const workspace = me.workspaces.find((w: { slug: string }) => w.slug === slug);
    const res = await fetch(`/api/workspaces/${workspace.id}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: "no-such-template" }),
    });
    return res.status;
  });
  expect(status).toBe(400);
});

