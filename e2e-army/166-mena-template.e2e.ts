// Issue #166: the templates gallery offers the MENA "ETA invoice notify" starter, and using it creates an editable flow.
// UI flow (signed-in owner, English UI). The template ships as a versioned JSON export under src/engine/templates/mena/.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-166 AC1: the templates gallery shows 'ETA Invoice Notify' and Use template creates a flow from it", { session: "fl-user", tags: ["feat:fl-templates", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  await app.open("/en/templates");
  await agent.act("open the Templates page from the workspace navigation");
  await expect(screen.getByText("ETA Invoice Notify")).toBeVisible();
  await agent.assert("the gallery card 'ETA Invoice Notify' lists its trigger sample and result");
  await agent.act("use the template 'ETA Invoice Notify'");
  await expect(browser).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
  await expect(screen.getByText("ETA Invoice Notify")).toBeVisible();
  await expect(screen.getByText("Pick waiting invoices")).toBeVisible();
});
