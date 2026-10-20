import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { LOCAL_SCENARIOS } from "@/engine/local-scenarios";
import { createProviderHttp } from "@/integrations/http";
import { getAction, getProvider } from "@/integrations/registry";
import type { ActionContext, Credentials, HttpRequest, HttpResponse } from "@/integrations/types";
import { ProviderError } from "@/integrations/types";
import { runAction } from "./helpers";

vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns")>();
  const lookup = (host: string, options: unknown, cb: unknown) => {
    if (host !== "mizano-internal.test") return (actual.lookup as unknown as (...a: unknown[]) => void)(host, options, cb);
    (cb as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: "10.0.0.5", family: 4 }]);
  };
  return { ...actual, lookup: lookup as unknown as typeof actual.lookup };
});

const creds: Credentials = { type: "api_key", token: "mz_test_scoped", settings: { baseUrl: "https://mizano.test" } };

function ctxReturning(data: unknown, idempotencyKey = "idem-mizano") {
  const request = vi.fn(async (_req: HttpRequest): Promise<HttpResponse<unknown>> => ({ status: 200, headers: new Headers(), data }));
  const ctx: ActionContext = {
    http: { request: request as ActionContext["http"]["request"] },
    credentials: creds,
    idempotencyKey,
    signal: new AbortController().signal,
    log: () => {},
  };
  return { ctx, request };
}

/** Asserts the rejection is a zod schema failure at the given path, not an unrelated error (e.g. an unregistered action). */
async function expectSchemaRejection(promise: Promise<unknown>, path: (string | number)[]) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ZodError);
  expect((err as ZodError).issues.some((issue) => JSON.stringify(issue.path) === JSON.stringify(path))).toBe(true);
}

const overdueResponse = {
  currency: "EGP",
  invoices: [
    { number: "INV-2041", customerName: "Cedar Studio", balanceDue: "1200.00", dueDate: "2026-09-10" },
    { number: "INV-2042", customerName: "Nile Bakery", balanceDue: "350.50", dueDate: "2026-09-30" },
  ],
};

describe("mizano.list_overdue_invoices", () => {
  it("is registered as a read-only action", () => {
    const found = getAction("mizano.list_overdue_invoices");
    expect(found?.action.sideEffect).toBe("none");
    expect(found?.provider.id).toBe("mizano");
  });

  it("asks Mizano for overdue invoices as of the requested date, on the configured https origin", async () => {
    const { ctx, request } = ctxReturning(overdueResponse);
    await runAction("mizano.list_overdue_invoices", ctx, { asOf: "2026-09-30" });
    const req = request.mock.calls[0][0];
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/api/invoices");
    expect(req.baseUrl).toBe("https://mizano.test");
    expect(req.query).toEqual({ status: "overdue", asOf: "2026-09-30" });
  });

  it("maps to the Invoice Follow-up List input shape with decimal-string amounts", async () => {
    const { ctx } = ctxReturning(overdueResponse);
    const out = await runAction<{ asOf: string; currency: string; invoices: Record<string, unknown>[] }>(
      "mizano.list_overdue_invoices",
      ctx,
      { asOf: "2026-09-30" },
    );
    expect(out).toEqual({
      asOf: "2026-09-30",
      currency: "EGP",
      invoices: [
        { number: "INV-2041", customer: "Cedar Studio", amount: "1200.00", dueDate: "2026-09-10", paid: false },
        { number: "INV-2042", customer: "Nile Bakery", amount: "350.50", dueDate: "2026-09-30", paid: false },
      ],
    });
    for (const inv of out.invoices) expect(typeof inv.amount).toBe("string");
  });

  it("matches the keys and value types of the Invoice Follow-up List trigger sample", async () => {
    const scenario = LOCAL_SCENARIOS.find((s) => s.id === "invoice-follow-up-list");
    const trigger = scenario?.graph.nodes.find((n) => n.id === "trigger");
    const sample = JSON.parse(String((trigger?.data.config as { samplePayload: string }).samplePayload)) as {
      asOf: string;
      currency: string;
      invoices: Record<string, unknown>[];
    };
    const { ctx } = ctxReturning(overdueResponse);
    const out = await runAction<{ asOf: string; currency: string; invoices: Record<string, unknown>[] }>(
      "mizano.list_overdue_invoices",
      ctx,
      { asOf: "2026-09-30" },
    );
    expect(Object.keys(out).sort()).toEqual(Object.keys(sample).sort());
    expect(typeof out.asOf).toBe("string");
    expect(typeof out.currency).toBe("string");
    for (const inv of out.invoices) {
      expect(Object.keys(inv).sort()).toEqual(Object.keys(sample.invoices[0]).sort());
      expect(typeof inv.number).toBe("string");
      expect(typeof inv.customer).toBe("string");
      expect(typeof inv.paid).toBe("boolean");
      expect(typeof inv.amount).toBe("string");
    }
  });

  it("returns an empty invoice list when nothing is overdue", async () => {
    const { ctx } = ctxReturning({ currency: "EGP", invoices: [] });
    const out = await runAction("mizano.list_overdue_invoices", ctx, { asOf: "2026-09-30" });
    expect(out).toEqual({ asOf: "2026-09-30", currency: "EGP", invoices: [] });
  });

  it("rejects a Mizano amount that is not a two-decimal string instead of guessing", async () => {
    const { ctx } = ctxReturning({
      currency: "EGP",
      invoices: [{ number: "INV-9", customerName: "X", balanceDue: 1200, dueDate: "2026-09-10" }],
    });
    await expectSchemaRejection(runAction("mizano.list_overdue_invoices", ctx, {}), [0, "balanceDue"]);
  });

  it("refuses a base URL that is not a bare https origin, before any request is sent", async () => {
    const { ctx, request } = ctxReturning(overdueResponse);
    ctx.credentials = { ...creds, settings: { baseUrl: "http://mizano.test/api" } };
    await expect(runAction("mizano.list_overdue_invoices", ctx, { asOf: "2026-09-30" })).rejects.toThrow("https origin");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    "https://127.0.0.1",
    "https://localhost:8443",
    "https://10.0.0.5",
    "https://169.254.169.254",
    "https://[::1]",
    "https://api.internal",
  ])("refuses a private or internal origin %s before any request is sent", async (baseUrl) => {
    const { ctx, request } = ctxReturning(overdueResponse);
    ctx.credentials = { ...creds, settings: { baseUrl } };
    await expect(runAction("mizano.list_overdue_invoices", ctx, { asOf: "2026-09-30" })).rejects.toThrow(/refused|private|internal/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a private origin on the connection check before any request is sent", async () => {
    const { ctx, request } = ctxReturning({ id: "ws_1", workspaceName: "Cedar" });
    ctx.credentials = { ...creds, settings: { baseUrl: "https://169.254.169.254" } };
    await expect(getProvider("mizano")!.identity(ctx)).rejects.toThrow(/refused|private/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves to a private address inside the request, before connecting", async () => {
    const baseUrl = "https://mizano-internal.test";
    const http = createProviderHttp(getProvider("mizano")!, { ...creds, settings: { baseUrl } }, new AbortController().signal);
    await expect(http.request({ method: "GET", path: "/api/me", baseUrl })).rejects.toMatchObject({ kind: "egress_blocked" });
  });

  it("returns the workspace identity from a well-formed /api/me response", async () => {
    const { ctx, request } = ctxReturning({ id: "ws_1", workspaceName: "Cedar Studio" });
    await expect(getProvider("mizano")!.identity(ctx)).resolves.toEqual({ accountId: "ws_1", label: "Cedar Studio" });
    expect(request.mock.calls[0][0].path).toBe("/api/me");
  });

  it("rejects an /api/me response that is not the expected identity shape", async () => {
    const { ctx } = ctxReturning({ id: "ws_1", workspaceName: "" });
    await expectSchemaRejection(getProvider("mizano")!.identity(ctx), ["workspaceName"]);
  });
});

describe("mizano.create_customer", () => {
  const customerResponse = {
    id: "cust_123",
    name: "Test Customer",
    company: "Test Company Ltd",
    email: "test@example.com",
    phone: "+1-555-0123",
    taxId: "123-4567890",
  };

  it("is registered as a write action", () => {
    const found = getAction("mizano.create_customer");
    expect(found?.action.sideEffect).toBe("non_idempotent");
    expect(found?.provider.id).toBe("mizano");
  });

  it("creates a customer via POST /api/customers with the run id as idempotency key", async () => {
    const { ctx, request } = ctxReturning(customerResponse);
    await runAction("mizano.create_customer", ctx, {
      name: "Test Customer",
      company: "Test Company Ltd",
      email: "test@example.com",
      phone: "+1-555-0123",
      taxId: "123-4567890",
    });
    const req = request.mock.calls[0][0];
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/api/customers");
    expect(req.baseUrl).toBe("https://mizano.test");
    expect(req.headers?.["Idempotency-Key"]).toBe("idem-mizano");
    expect(req.json).toEqual({
      name: "Test Customer",
      company: "Test Company Ltd",
      email: "test@example.com",
      phone: "+1-555-0123",
      taxId: "123-4567890",
    });
  });

  it("sends the same Idempotency-Key when called twice with the same ctx and input", async () => {
    const input = { name: "Test Customer", company: "Test Company Ltd", email: "test@example.com", phone: "+1-555-0123" };
    const { ctx, request } = ctxReturning(customerResponse);
    await runAction("mizano.create_customer", ctx, input);
    await runAction("mizano.create_customer", ctx, input);
    const key1 = request.mock.calls[0][0].headers?.["Idempotency-Key"];
    const key2 = request.mock.calls[1][0].headers?.["Idempotency-Key"];
    expect(key1).toBe("idem-mizano");
    expect(key2).toBe("idem-mizano");
    expect(key1).toBe(key2);
  });

  it("omits taxId from the request body when it is not provided", async () => {
    const { ctx, request } = ctxReturning({ ...customerResponse, taxId: undefined });
    await runAction("mizano.create_customer", ctx, {
      name: "Test Customer",
      company: "Test Company Ltd",
      email: "test@example.com",
      phone: "+1-555-0123",
    });
    const req = request.mock.calls[0][0];
    expect(req.json).toEqual({
      name: "Test Customer",
      company: "Test Company Ltd",
      email: "test@example.com",
      phone: "+1-555-0123",
    });
    expect(req.json).not.toHaveProperty("taxId");
  });

  it("sends the same Idempotency-Key when the same run repeats, and a different one for another run", async () => {
    const input = { name: "Test Customer", company: "Test Company Ltd", email: "test@example.com", phone: "+1-555-0123" };
    const first = ctxReturning(customerResponse, "fl_run1_node1");
    const again = ctxReturning(customerResponse, "fl_run1_node1");
    const other = ctxReturning(customerResponse, "fl_run2_node1");
    await runAction("mizano.create_customer", first.ctx, input);
    await runAction("mizano.create_customer", again.ctx, input);
    await runAction("mizano.create_customer", other.ctx, input);
    const key = (r: typeof first.request) => r.mock.calls[0][0].headers?.["Idempotency-Key"];
    expect(key(first.request)).toBe("fl_run1_node1");
    expect(key(again.request)).toBe(key(first.request));
    expect(key(other.request)).toBe("fl_run2_node1");
  });

  it("returns the created customer shape", async () => {
    const { ctx } = ctxReturning(customerResponse);
    const out = await runAction<{ id: string; name: string; company: string; email: string; phone: string; taxId?: string }>(
      "mizano.create_customer",
      ctx,
      {
        name: "Test Customer",
        company: "Test Company Ltd",
        email: "test@example.com",
        phone: "+1-555-0123",
        taxId: "123-4567890",
      },
    );
    expect(out).toEqual(customerResponse);
  });

  it("rejects invalid input (empty name)", async () => {
    const { ctx } = ctxReturning(customerResponse);
    await expect(
      runAction("mizano.create_customer", ctx, {
        name: "",
        company: "Test Company Ltd",
        email: "test@example.com",
        phone: "+1-555-0123",
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid input (invalid email)", async () => {
    const { ctx } = ctxReturning(customerResponse);
    await expect(
      runAction("mizano.create_customer", ctx, {
        name: "Test Customer",
        company: "Test Company Ltd",
        email: "invalid-email",
        phone: "+1-555-0123",
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid input (phone too long)", async () => {
    const { ctx } = ctxReturning(customerResponse);
    await expect(
      runAction("mizano.create_customer", ctx, {
        name: "Test Customer",
        company: "Test Company Ltd",
        email: "test@example.com",
        phone: "+1-555-0123456789012345678901234567890123456789012345678901234567890",
      }),
    ).rejects.toThrow();
  });
});

describe("mizano.create_draft_quote", () => {
  const quoteResponse = {
    id: "quote_456",
    customerId: "cust_123",
    currency: "EGP",
    lines: [
      { item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" },
      { item: "Hosting", qty: "1", unitPrice: "100.00", taxRate: "15.00" },
    ],
  };

  it("is registered as a write action", () => {
    const found = getAction("mizano.create_draft_quote");
    expect(found?.action.sideEffect).toBe("non_idempotent");
    expect(found?.provider.id).toBe("mizano");
  });

  it("creates a draft quote via POST /api/quotes with the run id as idempotency key", async () => {
    const { ctx, request } = ctxReturning(quoteResponse);
    await runAction("mizano.create_draft_quote", ctx, {
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" },
        { item: "Hosting", qty: "1", unitPrice: "100.00", taxRate: "15.00" },
      ],
    });
    const req = request.mock.calls[0][0];
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/api/quotes");
    expect(req.baseUrl).toBe("https://mizano.test");
    expect(req.headers?.["Idempotency-Key"]).toBe("idem-mizano");
    expect(req.json).toEqual({
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Consulting", qty: "10.00", unitPrice: "500.00", taxRate: "15.00" },
        { item: "Hosting", qty: "1.00", unitPrice: "100.00", taxRate: "15.00" },
      ],
    });
  });

  it("sends the same Idempotency-Key when called twice with the same ctx and input", async () => {
    const input = { customerId: "cust_123", currency: "EGP", lines: [{ item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" }] };
    const { ctx, request } = ctxReturning(quoteResponse);
    await runAction("mizano.create_draft_quote", ctx, input);
    await runAction("mizano.create_draft_quote", ctx, input);
    const key1 = request.mock.calls[0][0].headers?.["Idempotency-Key"];
    const key2 = request.mock.calls[1][0].headers?.["Idempotency-Key"];
    expect(key1).toBe("idem-mizano");
    expect(key2).toBe("idem-mizano");
    expect(key1).toBe(key2);
  });

  it("sends the same Idempotency-Key when the same run repeats, and a different one for another run", async () => {
    const input = { customerId: "cust_123", currency: "EGP", lines: [{ item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" }] };
    const first = ctxReturning(quoteResponse, "fl_run1_node2");
    const again = ctxReturning(quoteResponse, "fl_run1_node2");
    const other = ctxReturning(quoteResponse, "fl_run2_node2");
    await runAction("mizano.create_draft_quote", first.ctx, input);
    await runAction("mizano.create_draft_quote", again.ctx, input);
    await runAction("mizano.create_draft_quote", other.ctx, input);
    const key = (r: typeof first.request) => r.mock.calls[0][0].headers?.["Idempotency-Key"];
    expect(key(first.request)).toBe("fl_run1_node2");
    expect(key(again.request)).toBe(key(first.request));
    expect(key(other.request)).toBe("fl_run2_node2");
  });

  it("rejects a quote with no lines without calling Mizano", async () => {
    const { ctx, request } = ctxReturning(quoteResponse);
    await expect(runAction("mizano.create_draft_quote", ctx, { customerId: "cust_123", currency: "EGP", lines: [] })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a quote with more than 200 lines without calling Mizano", async () => {
    const { ctx, request } = ctxReturning(quoteResponse);
    const lines = Array.from({ length: 201 }, (_, i) => ({ item: `Item ${i}`, qty: "1", unitPrice: "1.00", taxRate: "0.00" }));
    await expect(runAction("mizano.create_draft_quote", ctx, { customerId: "cust_123", currency: "EGP", lines })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("returns the created quote shape", async () => {
    const { ctx } = ctxReturning(quoteResponse);
    const out = await runAction("mizano.create_draft_quote", ctx, {
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" },
        { item: "Hosting", qty: "1", unitPrice: "100.00", taxRate: "15.00" },
      ],
    });
    expect(out).toEqual(quoteResponse);
  });

  it("rejects invalid input (invalid currency)", async () => {
    const { ctx } = ctxReturning(quoteResponse);
    await expect(
      runAction("mizano.create_draft_quote", ctx, {
        customerId: "cust_123",
        currency: "xyz",
        lines: [
          { item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" },
        ],
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid input (invalid qty - negative number and string)", async () => {
    const { ctx } = ctxReturning(quoteResponse);
    for (const badQty of [-5, "-5"]) {
      const input = {
        customerId: "cust_123",
        currency: "EGP",
        lines: [
          { item: "Consulting", qty: badQty, unitPrice: "500.00", taxRate: "15.00" },
        ],
      };
      const action = getAction("mizano.create_draft_quote")!.action;
      let safeRes: ReturnType<typeof action.input.safeParse>;
      expect(() => {
        safeRes = action.input.safeParse(input);
      }).not.toThrow();
      expect(safeRes!.success).toBe(false);

      await expect(runAction("mizano.create_draft_quote", ctx, input)).rejects.toThrow();
    }
  });

  it("rejects invalid input (invalid unitPrice - negative number and string)", async () => {
    const { ctx } = ctxReturning(quoteResponse);
    for (const badPrice of [-100, "-100.00"]) {
      const input = {
        customerId: "cust_123",
        currency: "EGP",
        lines: [
          { item: "Consulting", qty: "10.00", unitPrice: badPrice, taxRate: "15.00" },
        ],
      };
      const action = getAction("mizano.create_draft_quote")!.action;
      let safeRes: ReturnType<typeof action.input.safeParse>;
      expect(() => {
        safeRes = action.input.safeParse(input);
      }).not.toThrow();
      expect(safeRes!.success).toBe(false);

      await expect(runAction("mizano.create_draft_quote", ctx, input)).rejects.toThrow();
    }
  });

  it("rejects invalid input (invalid taxRate - negative number and string)", async () => {
    const { ctx } = ctxReturning(quoteResponse);
    for (const badTax of [-5, "-5.00"]) {
      const input = {
        customerId: "cust_123",
        currency: "EGP",
        lines: [
          { item: "Consulting", qty: "10.00", unitPrice: "500.00", taxRate: badTax },
        ],
      };
      const action = getAction("mizano.create_draft_quote")!.action;
      let safeRes: ReturnType<typeof action.input.safeParse>;
      expect(() => {
        safeRes = action.input.safeParse(input);
      }).not.toThrow();
      expect(safeRes!.success).toBe(false);

      await expect(runAction("mizano.create_draft_quote", ctx, input)).rejects.toThrow();
    }
  });

  it("accepts decimal strings for qty, unitPrice, and taxRate", async () => {
    const decimalQuote = {
      id: "quote_456",
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Consulting", qty: "10.5", unitPrice: "500.50", taxRate: "15.75" },
      ],
    };
    const { ctx } = ctxReturning(decimalQuote);
    const out = await runAction("mizano.create_draft_quote", ctx, {
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Consulting", qty: "10.5", unitPrice: "500.50", taxRate: "15.75" },
      ],
    });
    const q = out as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
    expect(q.lines[0].qty).toBe("10.5");
    expect(q.lines[0].unitPrice).toBe("500.50");
    expect(q.lines[0].taxRate).toBe("15.75");
  });
});

// AC2 (#147): "re-running the same run does not create a second customer/quote". The e2e stack cannot reach a Mizano
// workspace, so the outcome is proved here against a stateful fake that behaves like the documented contract: a POST
// with an Idempotency-Key it has already seen replays the stored record instead of inserting a new one.
describe("mizano create steps against a stateful fake that dedupes on Idempotency-Key", () => {
  function fakeMizano() {
    const stored = new Map<string, unknown>();
    const created = { customers: [] as unknown[], quotes: [] as unknown[] };
    const http: ActionContext["http"] = {
      request: (async (req: HttpRequest): Promise<HttpResponse<unknown>> => {
        const key = req.headers?.["Idempotency-Key"];
        if (!key) throw new Error("Mizano would reject a create without an Idempotency-Key");
        const slot = `${req.path}|${key}`;
        if (!stored.has(slot)) {
          const list = req.path === "/api/customers" ? created.customers : created.quotes;
          const record = { id: `${req.path === "/api/customers" ? "cust" : "quote"}_${list.length + 1}`, ...(req.json as object) };
          list.push(record);
          stored.set(slot, record);
        }
        return { status: 200, headers: new Headers(), data: stored.get(slot) };
      }) as ActionContext["http"]["request"],
    };
    const ctxFor = (idempotencyKey: string): ActionContext => ({
      http,
      credentials: creds,
      idempotencyKey,
      signal: new AbortController().signal,
      log: () => {},
    });
    return { created, ctxFor };
  }

  const customer = { name: "Test Customer", company: "Test Company Ltd", email: "test@example.com", phone: "+1-555-0123" };
  const quote = { customerId: "cust_1", currency: "EGP", lines: [{ item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" }] };

  it("creates one customer and one quote when the same run executes twice, and a second pair for a new run", async () => {
    const { created, ctxFor } = fakeMizano();
    const run1 = ctxFor("fl_run1_node1");
    const first = await runAction("mizano.create_customer", run1, customer);
    const again = await runAction("mizano.create_customer", run1, customer);
    expect(again).toEqual(first);
    const q1 = await runAction("mizano.create_draft_quote", ctxFor("fl_run1_node2"), quote);
    const q1Again = await runAction("mizano.create_draft_quote", ctxFor("fl_run1_node2"), quote);
    expect(q1Again).toEqual(q1);
    expect(created.customers).toHaveLength(1);
    expect(created.quotes).toHaveLength(1);

    await runAction("mizano.create_customer", ctxFor("fl_run2_node1"), customer);
    await runAction("mizano.create_draft_quote", ctxFor("fl_run2_node2"), quote);
    expect(created.customers).toHaveLength(2);
    expect(created.quotes).toHaveLength(2);
  });
});

// AC3: error-path tests - mock returns 4xx/5xx, step fails with clear message, never logs credentials
describe("mizano create steps error handling", () => {
  function errorCtx(status: number, message: string) {
    const request = vi.fn(async (): Promise<HttpResponse<unknown>> => {
      throw new ProviderError(
        status >= 500 ? "server" : "client",
        `Mizano${status >= 500 ? ` error ${status}` : ""}: ${message}`,
        status
      );
    });
    const log = vi.fn<(message: string) => void>();
    const ctx: ActionContext = {
      http: { request: request as ActionContext["http"]["request"] },
      credentials: creds,
      idempotencyKey: "fl_run1_node1",
      signal: new AbortController().signal,
      log,
    };
    return { ctx, request, log };
  }

  it("mizano.create_customer fails with clear message on 4xx from Mizano", async () => {
    const { ctx, log } = errorCtx(400, "Bad Request: invalid input");
    await expect(
      runAction("mizano.create_customer", ctx, {
        name: "Test Customer",
        company: "Test Company Ltd",
        email: "test@example.com",
        phone: "+1-555-0123",
      }),
    ).rejects.toThrow(/Mizano: Bad Request: invalid input/);
    // Verify credentials are not logged
    const logCalls = log.mock.calls.flat().join(" ");
    expect(logCalls).not.toContain("mz_test_scoped");
    expect(logCalls).not.toContain("mizano.test");
  });

  it("mizano.create_customer fails with clear message on 5xx from Mizano", async () => {
    const { ctx, log } = errorCtx(500, "Internal Server Error");
    await expect(
      runAction("mizano.create_customer", ctx, {
        name: "Test Customer",
        company: "Test Company Ltd",
        email: "test@example.com",
        phone: "+1-555-0123",
      }),
    ).rejects.toThrow(/Mizano error 500: Internal Server Error/);
    const logCalls = log.mock.calls.flat().join(" ");
    expect(logCalls).not.toContain("mz_test_scoped");
    expect(logCalls).not.toContain("mizano.test");
  });

  it("mizano.create_draft_quote fails with clear message on 4xx from Mizano", async () => {
    const { ctx, log } = errorCtx(400, "Bad Request: invalid quote data");
    await expect(
      runAction("mizano.create_draft_quote", ctx, {
        customerId: "cust_123",
        currency: "EGP",
        lines: [{ item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" }],
      }),
    ).rejects.toThrow(/Mizano: Bad Request: invalid quote data/);
    const logCalls = log.mock.calls.flat().join(" ");
    expect(logCalls).not.toContain("mz_test_scoped");
    expect(logCalls).not.toContain("mizano.test");
  });

  it("mizano.create_draft_quote fails with clear message on 5xx from Mizano", async () => {
    const { ctx, log } = errorCtx(503, "Service Unavailable");
    await expect(
      runAction("mizano.create_draft_quote", ctx, {
        customerId: "cust_123",
        currency: "EGP",
        lines: [{ item: "Consulting", qty: "10", unitPrice: "500.00", taxRate: "15.00" }],
      }),
    ).rejects.toThrow(/Mizano error 503: Service Unavailable/);
    const logCalls = log.mock.calls.flat().join(" ");
    expect(logCalls).not.toContain("mz_test_scoped");
    expect(logCalls).not.toContain("mizano.test");
  });
});

describe("mizano.create_customer response schema", () => {
  const validInput = { name: "Acme Corp", company: "Acme Inc", email: "contact@acme.test", phone: "+201000000000" };
  const validResponse = { id: "cust_1", ...validInput };

  it("accepts a well-formed response (control for the rejections below)", async () => {
    const { ctx } = ctxReturning(validResponse);
    await expect(runAction("mizano.create_customer", ctx, validInput)).resolves.toMatchObject({ id: "cust_1" });
  });

  it("rejects a response missing the required id field", async () => {
    const { id: _id, ...noId } = validResponse;
    const { ctx } = ctxReturning(noId);
    await expectSchemaRejection(runAction("mizano.create_customer", ctx, validInput), ["id"]);
  });

  it("rejects a response where id is a number instead of a string", async () => {
    const { ctx } = ctxReturning({ ...validResponse, id: 123 });
    await expectSchemaRejection(runAction("mizano.create_customer", ctx, validInput), ["id"]);
  });
});

describe("mizano.create_draft_quote response schema", () => {
  const line = { item: "Widget", qty: "2", unitPrice: "100.00", taxRate: "14.00" };
  const validInput = { customerId: "cust_1", currency: "EGP", lines: [line] };
  const validResponse = { id: "quote_1", customerId: "cust_1", currency: "EGP", lines: [line] };

  it("accepts a well-formed response (control for the rejections below)", async () => {
    const { ctx } = ctxReturning(validResponse);
    await expect(runAction("mizano.create_draft_quote", ctx, validInput)).resolves.toMatchObject({ id: "quote_1" });
  });

  it("rejects a response missing the required id field", async () => {
    const { id: _id, ...noId } = validResponse;
    const { ctx } = ctxReturning(noId);
    await expectSchemaRejection(runAction("mizano.create_draft_quote", ctx, validInput), ["id"]);
  });

  it("rejects a response where a line has unitPrice as a number instead of a decimal string", async () => {
    const { ctx } = ctxReturning({ ...validResponse, lines: [{ ...line, unitPrice: 500 }] });
    await expectSchemaRejection(runAction("mizano.create_draft_quote", ctx, validInput), ["lines", 0, "unitPrice"]);
  });

  it("rejects a response where currency is not an upper-case ISO code", async () => {
    const { ctx } = ctxReturning({ ...validResponse, currency: "egp" });
    await expectSchemaRejection(runAction("mizano.create_draft_quote", ctx, validInput), ["currency"]);
  });
});
