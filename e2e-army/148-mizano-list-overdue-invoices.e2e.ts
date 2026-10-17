// Issue #148 (Mizano connector v1): the integrations catalog offers Mizano's "List overdue invoices" action, the step that
// feeds the Invoice Follow-up List. Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

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
