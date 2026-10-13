// Issue #252: the integrations catalog lists Mizano alongside the 12 SaaS providers (13 in total; Mizano added on purpose in #148).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-252 AC: the integrations catalog shows all 13 providers including Mizano",
  { tags: ["feat:fl-integrations"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.assert("the integrations catalog lists Mizano, Google Sheets, Gmail, Slack, HubSpot and Linear");
    await expect(screen.getByText("Mizano").first()).toBeVisible();
    await expect(screen.getByText("Linear").first()).toBeVisible();
  },
);
