// Issue #166: the templates gallery offers the MENA "ETA Invoice Notify" starter, and using it creates an editable flow.
// UI flow (signed-in owner, English UI). The template ships as a versioned JSON export under src/engine/templates/mena/.
// Assertions are deterministic locators (the gallery card's testid, the "Use template" button, the flow-name input and
// canvas node labels); no agent steps, so the test runs with or without a model.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-166 AC1: the templates gallery shows 'ETA Invoice Notify' and Use template creates a flow from it", { session: "fl-user", tags: ["feat:fl-templates", "lvl:ui"] }, async ({ app, screen, browser }) => {
  // /app continues in the session owner's workspace; the gallery is that workspace's /templates route.
  await app.open("/app");
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
  const slug = (await browser.url()).split("/")[2]!;
  await app.open(`/w/${slug}/templates`);
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/templates$/);
  // The gallery card shows the template's name and its sample and result text.
  const card = screen.getByTestId("template-eta-invoice-notify");
  await expect(card).toBeVisible();
  await expect(card).toContainText("ETA Invoice Notify");
  await expect(card).toContainText("A batch of invoices, each with a number, a customer and a status.");
  await expect(card).toContainText("The invoices waiting for ETA submission, or a note that none are waiting.");
  // Using the template creates a flow named after it, with the template's steps on the canvas.
  await card.getByRole("button", "Use template").click();
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows\/[0-9a-f-]{36}$/);
  await expect(screen.getByLabel("Flow name")).toHaveValue("ETA Invoice Notify");
  await expect(screen.getByText("Pick waiting invoices")).toBeVisible();
});

test("@issue-166 AC1: an unknown template id is rejected and creates no flow", { session: "fl-user", tags: ["feat:fl-templates", "lvl:api"] }, async ({ app, browser }) => {
  await app.open("/app");
  await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
  // The invalid case: a templateId outside the catalogue is a 400 in the session's own workspace, not a new flow.
  // The fetch runs in the page, so it carries the session's cookies (the test process has none).
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
