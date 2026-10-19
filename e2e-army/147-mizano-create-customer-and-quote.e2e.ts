// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// Issue #148: the catalog also offers Mizano's "List overdue invoices" action.
//
// Issue #232: Integrate toDecimalString with the Mizano connector — money values are sent as decimal strings.
// AC1: passing 12.5 to the Create draft quote step puts "12.50" in the request body.
// AC2: malformed or over-precise amounts (e.g. "1.005") are rejected by input validation and no request is made.
// Merged into 147-mizano-create-customer-and-quote.e2e.ts to stay within the hub's cap of 8 top-level e2e-army/*.e2e.ts files.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import type { HttpRequest, HttpResponse } from "@/integrations/types";

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

type Line = { item: string; qty: unknown; unitPrice: unknown; taxRate: unknown };

async function runQuote(lines: Line[]) {
  const { getAction } = await import("@/integrations/registry");
  const found = getAction("mizano.create_draft_quote");
  expect(found).toBeDefined();
  const action = found!.action;
  const creds = { type: "api_key" as const, token: "mz_test_scoped", settings: { baseUrl: "https://mizano.test" } };
  const requests: HttpRequest[] = [];
  const ctx = {
    http: {
      request: async (req: HttpRequest): Promise<HttpResponse<unknown>> => {
        requests.push(req);
        return { status: 200, headers: new Headers(), data: { id: "quote_test", customerId: "cust_123", currency: "EGP", lines: [] } };
      },
    },
    credentials: creds,
    idempotencyKey: "army-232-run-node",
    signal: new AbortController().signal,
    log: () => {},
  };
  const input = { customerId: "cust_123", currency: "EGP", lines };
  const parsed = action.input.safeParse(input);
  if (!parsed.success) return { requests, error: parsed.error };
  await action.run(ctx as never, parsed.data);
  return { requests, error: null };
}

type Body = { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };

test(
  "@issue-232 AC1: Create draft quote sends numbers and decimal strings as fixed 2-decimal strings",
  { tags: ["feat:fl-integration-actions", "shard:platform-api", "lvl:api"] },
  async () => {
    const { requests, error } = await runQuote([
      { item: "Test Item", qty: 12.5, unitPrice: 100, taxRate: 15 },
      { item: "String Item", qty: "10", unitPrice: "200.5", taxRate: "5.00" },
    ]);
    expect(error).toBeNull();
    expect(requests).toHaveLength(1);
    const body = requests[0].json as Body;
    expect(body.lines[0]).toMatchObject({ qty: "12.50", unitPrice: "100.00", taxRate: "15.00" });
    expect(body.lines[1]).toMatchObject({ qty: "10.00", unitPrice: "200.50", taxRate: "5.00" });
  },
);

test(
  "@issue-232 AC2: Create draft quote rejects an amount with more than 2 decimals and makes no request",
  { tags: ["feat:fl-integration-actions", "shard:platform-api", "lvl:api"] },
  async () => {
    const { requests, error } = await runQuote([{ item: "Test Item", qty: "1.005", unitPrice: 100, taxRate: 15 }]);
    expect(error).not.toBeNull();
    expect(requests).toHaveLength(0);
  },
);
