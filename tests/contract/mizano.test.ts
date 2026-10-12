import { describe, expect, it, vi } from "vitest";
import { LOCAL_SCENARIOS } from "@/engine/local-scenarios";
import { getAction } from "@/integrations/registry";
import type { ActionContext, Credentials, HttpRequest, HttpResponse } from "@/integrations/types";
import { runAction } from "./helpers";

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
});
