// The integrations catalog lists every registered provider, Mizano included (#147, #148). The stable gate `fl-integrations`
// (hub e2e-army platform-api [fl-integrations.2]) pins these 13 ids in this order; PR #418 hid Mizano and broke that gate (2026-10-24).
import { describe, expect, it, vi } from "vitest";
import { getAction, getProvider, listProviders } from "@/integrations/registry";
import { GET } from "@/app/api/integrations/catalog/route";

vi.mock("@/server/access", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", email: "user@example.com" })),
  requireWorkspace: vi.fn(async () => ({ workspace: { id: "ws-1" } })),
}));
vi.mock("@/server/connections", () => ({
  oauthConfigured: vi.fn(async () => false),
}));
vi.mock("@/server/code-sandbox", () => ({
  codeSandboxAvailable: vi.fn(async () => ({ ok: true, reason: null })),
}));

const CATALOG_IDS = ["google_sheets", "gmail", "slack", "hubspot", "zendesk", "airtable", "snowflake", "github", "stripe", "notion", "postgres", "linear", "mizano"];

describe("integration catalog", () => {
  it("lists exactly the 13 providers, in order, Mizano last", () => {
    expect(listProviders().map((p) => p.id)).toEqual(CATALOG_IDS);
  });

  it("offers Mizano's create-customer, create-quote and list-overdue-invoices actions (#147, #148)", () => {
    expect(getProvider("mizano")?.id).toBe("mizano");
    expect(getAction("mizano.create_customer")?.provider.id).toBe("mizano");
    expect(listProviders().flatMap((p) => p.actions).filter((a) => a.id.startsWith("mizano.")).length).toBeGreaterThanOrEqual(3);
  });

  it("GET /api/integrations/catalog returns the 13 ids in order with a matching count", async () => {
    const res = await GET(new Request("http://localhost/api/integrations/catalog"), {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(13);
    expect(data.providers.map((p: { id: string }) => p.id)).toEqual(CATALOG_IDS);
    const mizano = data.providers.find((p: { id: string }) => p.id === "mizano");
    expect(mizano.authType).toBe("api_key");
    expect(mizano.oauthConfigured).toBeNull();
    expect(mizano.connectFields.length).toBeGreaterThan(0);
  });
});
