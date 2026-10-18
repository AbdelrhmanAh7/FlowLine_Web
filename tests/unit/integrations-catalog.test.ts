import { describe, expect, it, vi } from "vitest";
import { allProviders, getAction, getProvider, listProviders } from "@/integrations/registry";
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

// #252: the stable gate's fl-integrations check expects the 12 supported SaaS providers, in this order.
const CATALOG_IDS = ["google_sheets", "gmail", "slack", "hubspot", "zendesk", "airtable", "snowflake", "github", "stripe", "notion", "postgres", "linear"];

describe("integration catalog (#252)", () => {
  it("lists exactly the 12 supported providers, in order", () => {
    expect(listProviders().map((p) => p.id)).toEqual(CATALOG_IDS);
  });

  it("keeps the pre-GA Mizano provider out of the catalog", () => {
    expect(listProviders().some((p) => p.id === "mizano")).toBe(false);
    expect(listProviders().flatMap((p) => p.actions).some((a) => a.id.startsWith("mizano."))).toBe(false);
  });

  it("still registers every supported provider and Mizano for lookups by id", () => {
    for (const id of CATALOG_IDS) expect(getProvider(id)?.id).toBe(id);
    expect(allProviders().map((p) => p.id)).toEqual([...CATALOG_IDS, "mizano"]);
    expect(getProvider("mizano")?.id).toBe("mizano");
    expect(getAction("mizano.create_customer")?.provider.id).toBe("mizano");
  });

  it("GET /api/integrations/catalog returns exactly the 12 ids in order and contains no 'mizano'", async () => {
    const res = await GET(new Request("http://localhost/api/integrations/catalog"), {} as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(12);
    expect(data.providers.map((p: { id: string }) => p.id)).toEqual(CATALOG_IDS);
    expect(data.providers.some((p: { id: string }) => p.id === "mizano")).toBe(false);
  });
});
