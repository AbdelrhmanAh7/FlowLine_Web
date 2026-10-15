// Issue #232: Integrate toDecimalString with Mizano connector — money values sent as decimal strings.
// Acceptance: passing 12.5 to a Mizano step produces '12.50' in the request body.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import type { HttpRequest, HttpResponse } from "@/integrations/types";

// This is an API-level test since we're testing the request body formatting.
// The Mizano connector's create_draft_quote action should convert number inputs to decimal strings.
test(
  "@issue-232 AC: create_draft_quote converts number qty/unitPrice/taxRate to decimal strings in request body",
  { tags: ["feat:fl-integration-actions", "shard:platform-api", "lvl:api"] },
  async ({ app }) => {
    const _baseUrl = app.baseUrl;
    const creds = {
      type: "api_key" as const,
      token: "mz_test_scoped",
      settings: { baseUrl: "https://mizano.test" },
    };

    // Import the provider and action directly to test the request body
    const { getProvider } = await import("@/integrations/registry");
    const { createProviderHttp } = await import("@/integrations/http");

    const provider = getProvider("mizano");
    const action = provider!.actions.find((a) => a.id === "mizano.create_draft_quote");
    expect(action).toBeDefined();

    // Mock HTTP request to capture the request body
    let capturedRequest: HttpRequest | null = null;
    const http = createProviderHttp(provider!, creds, new AbortController().signal);
    http.request = async (req: HttpRequest): Promise<HttpResponse<unknown>> => {
      capturedRequest = req;
      return {
        status: 200,
        headers: new Headers(),
        data: {
          id: "quote_test",
          customerId: "cust_123",
          currency: "EGP",
          lines: [
            { item: "Test Item", qty: "12.50", unitPrice: "100.00", taxRate: "15.00" },
          ],
        },
      };
    };

    // Create action context with mocked http
    const ctx = {
      http,
      credentials: creds,
      idempotencyKey: "test-run-node-1",
      signal: new AbortController().signal,
      log: () => {},
    };

    // Run the action with number inputs
    await action!.run(ctx, {
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Test Item", qty: 12.5, unitPrice: 100, taxRate: 15 },
      ],
    });

    // Verify the request body has decimal strings
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.json).toBeDefined();
    const body = capturedRequest!.json as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].qty).toBe("12.50");
    expect(body.lines[0].unitPrice).toBe("100.00");
    expect(body.lines[0].taxRate).toBe("15.00");
  },
);

// Also test with string inputs that are already properly formatted (should remain unchanged)
test(
  "@issue-232 AC: create_draft_quote preserves properly formatted decimal string inputs",
  { tags: ["feat:fl-integration-actions", "shard:platform-api", "lvl:api"] },
  async ({ app }) => {
    const _baseUrl = app.baseUrl;
    const creds = {
      type: "api_key" as const,
      token: "mz_test_scoped",
      settings: { baseUrl: "https://mizano.test" },
    };

    const { getProvider } = await import("@/integrations/registry");
    const { createProviderHttp } = await import("@/integrations/http");

    const provider = getProvider("mizano");
    const action = provider!.actions.find((a) => a.id === "mizano.create_draft_quote");
    expect(action).toBeDefined();

    let capturedRequest: HttpRequest | null = null;
    const http = createProviderHttp(provider!, creds, new AbortController().signal);
    http.request = async (req: HttpRequest): Promise<HttpResponse<unknown>> => {
      capturedRequest = req;
      return {
        status: 200,
        headers: new Headers(),
        data: {
          id: "quote_test",
          customerId: "cust_123",
          currency: "EGP",
          lines: [
            { item: "Test Item", qty: "12.50", unitPrice: "100.00", taxRate: "15.00" },
          ],
        },
      };
    };

    const ctx = {
      http,
      credentials: creds,
      idempotencyKey: "test-run-node-2",
      signal: new AbortController().signal,
      log: () => {},
    };

    // Run with string inputs that are already properly formatted
    await action!.run(ctx, {
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Test Item", qty: "12.50", unitPrice: "100.00", taxRate: "15.00" },
      ],
    });

    expect(capturedRequest).not.toBeNull();
    const body = capturedRequest!.json as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
    expect(body.lines[0].qty).toBe("12.50");
    expect(body.lines[0].unitPrice).toBe("100.00");
    expect(body.lines[0].taxRate).toBe("15.00");
  },
);

// Test with mixed number and string inputs
test(
  "@issue-232 AC: create_draft_quote handles mixed number and string inputs correctly",
  { tags: ["feat:fl-integration-actions", "shard:platform-api", "lvl:api"] },
  async ({ app }) => {
    const _baseUrl = app.baseUrl;
    const creds = {
      type: "api_key" as const,
      token: "mz_test_scoped",
      settings: { baseUrl: "https://mizano.test" },
    };

    const { getProvider } = await import("@/integrations/registry");
    const { createProviderHttp } = await import("@/integrations/http");

    const provider = getProvider("mizano");
    const action = provider!.actions.find((a) => a.id === "mizano.create_draft_quote");
    expect(action).toBeDefined();

    let capturedRequest: HttpRequest | null = null;
    const http = createProviderHttp(provider!, creds, new AbortController().signal);
    http.request = async (req: HttpRequest): Promise<HttpResponse<unknown>> => {
      capturedRequest = req;
      return {
        status: 200,
        headers: new Headers(),
        data: {
          id: "quote_test",
          customerId: "cust_123",
          currency: "EGP",
          lines: [
            { item: "Item 1", qty: "10.00", unitPrice: "50.50", taxRate: "10.00" },
            { item: "Item 2", qty: "2.50", unitPrice: "200.00", taxRate: "5.00" },
          ],
        },
      };
    };

    const ctx = {
      http,
      credentials: creds,
      idempotencyKey: "test-run-node-3",
      signal: new AbortController().signal,
      log: () => {},
    };

    // Run with mixed inputs: first line numbers, second line strings
    await action!.run(ctx, {
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Item 1", qty: 10, unitPrice: 50.5, taxRate: 10 },
        { item: "Item 2", qty: "2.50", unitPrice: "200.00", taxRate: "5.00" },
      ],
    });

    expect(capturedRequest).not.toBeNull();
    const body = capturedRequest!.json as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
    expect(body.lines).toHaveLength(2);
    // First line: numbers converted to decimal strings
    expect(body.lines[0].qty).toBe("10.00");
    expect(body.lines[0].unitPrice).toBe("50.50");
    expect(body.lines[0].taxRate).toBe("10.00");
    // Second line: strings preserved
    expect(body.lines[1].qty).toBe("2.50");
    expect(body.lines[1].unitPrice).toBe("200.00");
    expect(body.lines[1].taxRate).toBe("5.00");
  },
);