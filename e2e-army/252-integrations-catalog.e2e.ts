// Issue #252 (supersedes the catalog checks of #147 and #148): the integrations catalog lists exactly the 12 supported
// providers and does not offer Mizano. Mizano stays registered (saved steps and connections still resolve by id) but is
// hidden from the catalog until its connection type and live proof ship (MZ G5, #215), because the stable gate's
// fl-integrations check expects the 12. The Mizano steps ("Create customer", "Create draft quote", "List overdue
// invoices") are proved without the catalog: tests/contract/mizano.test.ts (in-process, including the Idempotency-Key
// replay: "mizano create steps against a stateful fake that dedupes on Idempotency-Key") and
// tests/contract/mizano-http.test.ts (real HTTP against the fake Mizano API). The catalog id list and order are pinned in
// tests/unit/integrations-catalog.test.ts. This file replaces the #147 file, so the repo stays within the hub cap of 8 top-level files.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PROVIDERS = [
  "Google Sheets",
  "Gmail",
  "Slack",
  "HubSpot",
  "Zendesk",
  "Airtable",
  "Snowflake",
  "GitHub",
  "Stripe",
  "Notion",
  "PostgreSQL",
  "Linear",
];

test(
  "@issue-252 AC1: the integrations catalog lists the 12 supported providers and not Mizano",
  { tags: ["feat:fl-integrations"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.assert(
      "the integrations catalog lists Google Sheets, Gmail, Slack, HubSpot, Zendesk, Airtable, Snowflake, GitHub, Stripe, Notion, PostgreSQL and Linear, and no Mizano",
    );
    for (const name of PROVIDERS) await expect(screen.getByText(name).first()).toBeVisible();
    await expect(screen.getByText("Mizano")).toHaveCount(0);
  },
);
