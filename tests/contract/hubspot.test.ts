import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeyCreds, expectProviderError, makeCtx, provider, queryOf, runAction, startFake, type Fake } from "./helpers";

const p = provider("hubspot");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("hubspot identity", () => {
  it("returns the portal id", async () => {
    const id = await p.identity(makeCtx(p, apiKeyCreds));
    expect(id).toEqual({ accountId: "987654", label: "Portal 987654" });
    const r = await fake.lastRequest("hubspot");
    expect(r.path).toBe("/account-info/v3/details");
    expect(r.headers["x-auth-scheme"]).toBe("bearer");
  });
});

describe("hubspot.upsert_contact", () => {
  it("batch-upserts keyed by email and is idempotent in the fake state", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    const input = { email: "bob@example.com", properties: { firstname: "Bob", lastname: "Builder" } };
    const out = await runAction<{ contacts: { id: string; email: string }[] }>("hubspot.upsert_contact", ctx, input);
    expect(out.contacts[0]!.email).toBe("bob@example.com");

    const r = await fake.lastRequest("hubspot");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/crm/v3/objects/contacts/batch/upsert");
    const body = r.body as { inputs: { idProperty: string; id: string; properties: Record<string, string> }[] };
    expect(body.inputs[0]!.idProperty).toBe("email");
    expect(body.inputs[0]!.id).toBe("bob@example.com");
    expect(body.inputs[0]!.properties).toMatchObject({ email: "bob@example.com", firstname: "Bob" });

    // Upserting again must update, not duplicate.
    await runAction("hubspot.upsert_contact", ctx, input);
    const state = await fake.state<{ contacts: { properties: { email: string } }[] }>("hubspot");
    expect(state.contacts.filter((c) => c.properties.email === "bob@example.com")).toHaveLength(1);
  });

  it("updates the seeded contact by email", async () => {
    const out = await runAction<{ contacts: { id: string }[] }>("hubspot.upsert_contact", makeCtx(p, apiKeyCreds), {
      email: "alice@example.com",
      properties: { lastname: "Updated" },
    });
    expect(out.contacts[0]!.id).toBe("501");
  });
});

describe("hubspot.get_contact", () => {
  it("fetches by email with idProperty=email", async () => {
    const out = await runAction<{ id: string; properties: Record<string, unknown> }>("hubspot.get_contact", makeCtx(p, apiKeyCreds), {
      email: "alice@example.com",
    });
    expect(out.id).toBe("501");
    const r = await fake.lastRequest("hubspot");
    expect(r.method).toBe("GET");
    expect(r.path).toBe(`/crm/v3/objects/contacts/${encodeURIComponent("alice@example.com")}`);
    expect(queryOf(r).get("idProperty")).toBe("email");
  });

  it("maps a missing contact to not_found", async () => {
    await expectProviderError(
      runAction("hubspot.get_contact", makeCtx(p, apiKeyCreds), { email: "ghost@example.com" }),
      "not_found",
    );
  });
});

describe("hubspot.create_deal", () => {
  it("creates a deal with only the provided properties", async () => {
    const out = await runAction<{ id: string }>("hubspot.create_deal", makeCtx(p, apiKeyCreds), {
      dealname: "Acme renewal",
      amount: "1250",
    });
    expect(out.id).toBeTruthy();
    const r = await fake.lastRequest("hubspot");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/crm/v3/objects/deals");
    expect(r.body).toEqual({ properties: { dealname: "Acme renewal", amount: "1250" } });
  });
});
