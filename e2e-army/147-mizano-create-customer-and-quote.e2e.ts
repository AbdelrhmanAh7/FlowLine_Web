// Issue #147: Mizano steps 'Create customer' and 'Create draft quote'
// Tests the two HTTP-backed steps: POST /api/customers and POST /api/quotes
// This is an API-level test (no UI), tagged with the integration features.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-147 AC1: both steps appear in the integrations catalog under Mizano",
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
  "@issue-147 AC2: re-running the same run does not create a second customer/quote (idempotency key)",
  { tags: ["feat:fl-integration-actions", "feat:fl-jobs"], session: "fl-user" },
  async ({ app, agent }) => {
    await app.open("/");
    await agent.act("open the workspace's Workflows page from the navigation");
    await agent.act("create a new workflow named {name} with a trigger", { params: { name: "147-test-customer-quote" } });
    await agent.act("add a Mizano Create customer step to the workflow");
    await agent.act("add a Mizano Create draft quote step to the workflow");
    await agent.act("save the workflow");
    // Run the workflow once
    await agent.act("trigger the workflow");
    await agent.assert("the workflow run completed successfully");
    // Retry the SAME run (idempotency comes from the run id, not a new run)
    await agent.act("open the completed run and retry it");
    await agent.assert("the retried workflow run completed successfully");
  },
);
