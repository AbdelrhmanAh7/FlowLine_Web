import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeyCreds, makeCtx, provider, runAction, startFake, type Fake } from "./helpers";

const p = provider("airtable");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("airtable identity", () => {
  it("returns whoami", async () => {
    const id = await p.identity(makeCtx(p, apiKeyCreds));
    expect(id).toEqual({ accountId: "usrFakeAlice", label: "alice@flowline.test" });
    const r = await fake.lastRequest("airtable");
    expect(r.path).toBe("/v0/meta/whoami");
  });
});

describe("airtable.list_records", () => {
  it("lists records in the seeded table", async () => {
    const out = await runAction<{ records: { id: string; fields: Record<string, unknown> }[] }>(
      "airtable.list_records",
      makeCtx(p, apiKeyCreds),
      { baseId: "appTest", table: "Invoices" },
    );
    expect(out.records).toHaveLength(2);
    expect(out.records[0]!.fields["Invoice ID"]).toBe("INV-001");
    const r = await fake.lastRequest("airtable");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/v0/appTest/Invoices");
  });
});

describe("airtable.upsert_record", () => {
  it("PATCHes with performUpsert and updates the matching record", async () => {
    const out = await runAction<{ records: { id: string }[] }>("airtable.upsert_record", makeCtx(p, apiKeyCreds), {
      baseId: "appTest",
      table: "Invoices",
      fieldsToMergeOn: ["Invoice ID"],
      fields: { "Invoice ID": "INV-001", Vendor: "Acme Supplies", Total: 1300 },
    });
    expect(out.records[0]!.id).toBe("recINV001");
    const r = await fake.lastRequest("airtable");
    expect(r.method).toBe("PATCH");
    const body = r.body as { performUpsert: { fieldsToMergeOn: string[] }; records: { fields: Record<string, unknown> }[] };
    expect(body.performUpsert.fieldsToMergeOn).toEqual(["Invoice ID"]);
    const state = await fake.state<{ records: Record<string, { fields: Record<string, unknown> }[]> }>("airtable");
    expect(state.records["appTest/Invoices"]!.find((x) => x.fields["Invoice ID"] === "INV-001")!.fields.Total).toBe(1300);
  });

  it("creates when no record matches the merge fields", async () => {
    await runAction("airtable.upsert_record", makeCtx(p, apiKeyCreds), {
      baseId: "appTest",
      table: "Invoices",
      fieldsToMergeOn: ["Invoice ID"],
      fields: { "Invoice ID": "INV-009", Vendor: "Umbrella", Total: 42 },
    });
    const state = await fake.state<{ records: Record<string, unknown[]> }>("airtable");
    expect(state.records["appTest/Invoices"]).toHaveLength(3);
  });
});

describe("airtable.create_record", () => {
  it("POSTs a new record", async () => {
    const out = await runAction<{ id: string }>("airtable.create_record", makeCtx(p, apiKeyCreds), {
      baseId: "appTest",
      table: "Invoices",
      fields: { "Invoice ID": "INV-010", Vendor: "Stark", Total: 77 },
    });
    expect(out.id).toMatch(/^rec/);
    const r = await fake.lastRequest("airtable");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v0/appTest/Invoices");
  });
});
