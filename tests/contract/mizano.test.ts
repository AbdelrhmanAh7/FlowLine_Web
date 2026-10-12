import { describe, expect, it, vi } from "vitest";
import { LOCAL_SCENARIOS } from "@/engine/local-scenarios";
import { createProviderHttp } from "@/integrations/http";
import { getAction, getProvider } from "@/integrations/registry";
import type { ActionContext, Credentials, HttpRequest, HttpResponse } from "@/integrations/types";
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

function ctxReturning(data: unknown) {
  const request = vi.fn(async (_req: HttpRequest): Promise<HttpResponse<unknown>> => ({ status: 200, headers: new Headers(), data }));
  const ctx: ActionContext = {
    http: { request: request as ActionContext["http"]["request"] },
    credentials: creds,
    idempotencyKey: "idem-mizano",
    signal: new AbortController().signal,
    log: () => {},
  };
  return { ctx, request };
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
    await expect(runAction("mizano.list_overdue_invoices", ctx, {})).rejects.toThrow();
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
    await expect(getProvider("mizano")!.identity(ctx)).rejects.toThrow();
  });
});
