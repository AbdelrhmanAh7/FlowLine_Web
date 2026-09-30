/**
 * Unit checks for the second retest fix round (cceeb5d): the CXH-11 data step's provider list matches the registry,
 * and listing parsers tell "no price supplied" from "an unusable price" (CXH-09).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOpenRouterModels, parseVercelModels } from "@/ai/hub/protocols/listings";
import { PROVIDERS } from "@/ai/hub/registry";

describe("CXH-11 data step", () => {
  it("backfills 'listing' proofs for exactly the providers whose model list requires the key", () => {
    const dir = path.join(process.cwd(), "drizzle");
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => /_hub_retest_data\.sql$/.test(f))!), "utf8");
    const lists = [...sql.matchAll(/"provider" (?:NOT )?IN \(([^)]*)\)/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort());
    const keyRequired = PROVIDERS.filter((p) => p.listingAuth === "key-required" && !p.keyCheckPath && p.discovery !== "static-catalogue" && p.discovery !== "none")
      .map((p) => p.id)
      .sort();
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual(keyRequired);
    expect(lists[1]).toEqual(keyRequired);
  });
});

describe("CXH-09 listing prices", () => {
  it("OpenRouter / Vercel: a supplied but unusable price is flagged invalid; no price object is not", () => {
    const or = parseOpenRouterModels(
      {
        data: [
          { id: "a/blank", pricing: { prompt: "", completion: "" } },
          { id: "a/variable", pricing: { prompt: "-1", completion: "-1" } },
          { id: "a/none" },
          { id: "a/ok", pricing: { prompt: "0.000001", completion: "0.000002" } },
          { id: "a/free", pricing: { prompt: "0", completion: "0" } },
        ],
        total_count: 5,
      },
      0,
    ).models;
    const by = (id: string) => or.find((m) => m.id === id)!;
    expect(by("a/blank")).toMatchObject({ pricing: null, pricingInvalid: true });
    expect(by("a/variable")).toMatchObject({ pricing: null, pricingInvalid: true });
    expect(by("a/none")).toMatchObject({ pricing: null, pricingInvalid: false });
    expect(by("a/ok")).toMatchObject({ pricing: { inputPerMTokMicros: 1_000_000, outputPerMTokMicros: 2_000_000 }, pricingInvalid: false });
    expect(by("a/free")).toMatchObject({ pricing: { inputPerMTokMicros: 0, outputPerMTokMicros: 0 }, pricingInvalid: false });
    const v = parseVercelModels({ data: [{ id: "v/bad", pricing: { input: "abc", output: "1" } }, { id: "v/none" }] }).models;
    expect(v[0]).toMatchObject({ pricing: null, pricingInvalid: true });
    expect(v[1]).toMatchObject({ pricing: null, pricingInvalid: false });
  });
});
