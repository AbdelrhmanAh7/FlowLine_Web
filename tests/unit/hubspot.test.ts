import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import hubspot from "@/integrations/providers/hubspot";
import { getAction } from "@/integrations/registry";
import { ProviderError, type ActionContext, type HttpRequest } from "@/integrations/types";

const list = getAction("hubspot.list_contacts")!.action;

function context(data: unknown) {
  const request = vi.fn(async (_req: HttpRequest) => ({ status: 200, headers: new Headers(), data }));
  const log = vi.fn();
  const ctx: ActionContext = {
    http: { request: async <T>(req: HttpRequest) => {
      const response = await request(req);
      return { ...response, data: response.data as T };
    } },
    credentials: { type: "api_key", token: "private-token-canary" },
    signal: new AbortController().signal,
    idempotencyKey: "hubspot-unit",
    log,
  };
  return { ctx, request, log };
}

describe("HubSpot list contacts", () => {
  it("registers a read-only action with serializable input/output schemas and honest verification", () => {
    expect(list.provider).toBe("hubspot");
    expect(list.sideEffect).toBe("none");
    expect(list.requiredScopes).toEqual(["crm.objects.contacts.read"]);
    expect(z.toJSONSchema(list.input).properties).toHaveProperty("after");
    expect(z.toJSONSchema(list.output).properties).toHaveProperty("nextAfter");
    expect(hubspot.verification).toMatchObject({ betaScope: "deferred", live: "blocked" });
  });

  it("defaults to a bounded page and preserves nullable properties without following provider links", async () => {
    const { ctx, request, log } = context({
      results: [{ id: "501", properties: { email: null, firstname: "Alice" }, archived: false }],
      paging: { next: { after: "601", link: "https://untrusted.example/next" } },
      token: "private-token-canary",
    });
    const out = await list.run(ctx, list.input.parse({}));
    expect(list.output.parse(out)).toEqual({ contacts: [{ id: "501", properties: { email: null, firstname: "Alice" } }], nextAfter: "601" });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: "GET", path: "/crm/v3/objects/contacts",
      query: { limit: 25, after: undefined, properties: "email,firstname,lastname", archived: false },
    });
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(out)).not.toContain(ctx.credentials.token);
  });

  it("passes an opaque cursor only as a query value and terminates an empty page", async () => {
    const { ctx, request } = context({ results: [] });
    expect(await list.run(ctx, list.input.parse({ limit: 1, after: "cursor+/=", properties: ["email"] }))).toEqual({ contacts: [], nextAfter: null });
    expect(request.mock.calls[0]![0].query).toEqual({ limit: 1, after: "cursor+/=", properties: "email", archived: false });
  });

  it.each([
    { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: "25" },
    { after: "" }, { after: "x".repeat(129) },
    { properties: [] }, { properties: ["email,firstname"] }, { properties: ["x".repeat(101)] },
    { properties: Array.from({ length: 51 }, (_, i) => `field_${i}`) },
  ])("rejects invalid input %j before a request", (input) => {
    expect(list.input.safeParse(input).success).toBe(false);
  });

  it.each([
    null, { results: "private-token-canary" },
    { results: [{ id: "", properties: {} }] },
    { results: [{ id: "501", properties: { email: 123 } }] },
    { results: [], paging: { next: { link: "https://untrusted.example" } } },
    { results: Array.from({ length: 101 }, () => ({ id: "1", properties: {} })) },
  ])("fails malformed responses with a fixed diagnostic", async (data) => {
    const { ctx, log } = context(data);
    await expect(list.run(ctx, list.input.parse({}))).rejects.toMatchObject({ kind: "client", message: "HubSpot returned an invalid contacts response" });
    expect(log).not.toHaveBeenCalled();
  });

  it("rejects a response that exceeds the requested page size", async () => {
    const { ctx } = context({ results: [{ id: "1", properties: {} }, { id: "2", properties: {} }] });
    await expect(list.run(ctx, list.input.parse({ limit: 1 }))).rejects.toBeInstanceOf(ProviderError);
  });

  it.each(["auth", "rate_limit", "server", "not_found"] as const)("preserves %s classification while removing reflected credentials", async (kind) => {
    const { ctx, request, log } = context(null);
    request.mockRejectedValue(new ProviderError(kind, "reflected private-token-canary", 429, 1000));
    await expect(list.run(ctx, list.input.parse({}))).rejects.toMatchObject({ kind, status: 429, retryAfterMs: 1000, message: `HubSpot request failed (${kind})` });
    expect(log).not.toHaveBeenCalled();
  });

  it("preserves cancellation", async () => {
    const { ctx, request } = context(null);
    const cancelled = new DOMException("Cancelled", "AbortError");
    request.mockRejectedValue(cancelled);
    await expect(list.run(ctx, list.input.parse({}))).rejects.toBe(cancelled);
  });
});

describe("HubSpot connection identity and contact key", () => {
  it.each([{}, { portalId: "private-token-canary" }, { portalId: 0 }, { portalId: -1 }, { portalId: 1.5 }])("rejects malformed portal identity %j", async (data) => {
    const { ctx } = context(data);
    await expect(hubspot.identity(ctx)).rejects.toMatchObject({ kind: "client", message: "HubSpot returned an invalid account identity" });
  });

  it("keeps the upsert email key consistent even if extra properties include email", async () => {
    const { ctx, request } = context({ results: [{ id: "601", properties: { email: "key@example.com" } }] });
    const upsert = getAction("hubspot.upsert_contact")!.action;
    await upsert.run(ctx, upsert.input.parse({ email: "key@example.com", properties: { email: "other@example.com", firstname: "Key" } }));
    expect(request.mock.calls[0]![0].json).toEqual({ inputs: [{ idProperty: "email", id: "key@example.com", properties: { email: "key@example.com", firstname: "Key" } }] });
  });
});
