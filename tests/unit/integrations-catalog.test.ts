import { describe, expect, it } from "vitest";
import { allProviders, getAction, getProvider, listProviders } from "@/integrations/registry";

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
});
