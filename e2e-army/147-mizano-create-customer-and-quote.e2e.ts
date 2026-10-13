// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion) is covered by the mocked contract tests in
// tests/contract/mizano.test.ts, where the provider sends Idempotency-Key from the engine's per-(run, node) key.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

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
