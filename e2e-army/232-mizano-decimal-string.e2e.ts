// Issue #232: Integrate toDecimalString with the Mizano connector — money values are sent as decimal strings.
// AC1: passing 12.5 to the Create draft quote step puts "12.50" in the request body.
// AC2: malformed or over-precise amounts (e.g. "1.005") are rejected by input validation and no request is made.
// No Mizano workspace is reachable from the throwaway stack, so the step runs against a captured request, through the
// same path production uses: the action's input schema is parsed first, then run() receives the parsed input.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import type { HttpRequest, HttpResponse } from "@/integrations/types";

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
