import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

  it("distinguishes a second portal for same-account reconnect enforcement", async () => {
    expect(await p.identity(makeCtx(p, { type: "api_key", token: "second-account-token" }))).toEqual({ accountId: "123456", label: "Portal 123456" });
  });
});

describe("hubspot.list_contacts", () => {
  beforeEach(async () => { await fake.reset(); });

  type Page = { contacts: { id: string; properties: Record<string, string | null> }[]; nextAfter: string | null };

  it("reads selected properties and follows next-record cursors without overlap or writes", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    for (const email of ["page-one@example.com", "page-two@example.com"]) {
      await runAction("hubspot.upsert_contact", ctx, { email });
    }
    const before = await fake.state("hubspot");
    const pages: Page[] = [];
    let after: string | undefined;
    for (let i = 0; i < 3; i++) {
      const page = await runAction<Page>("hubspot.list_contacts", ctx, { limit: 1, after, properties: ["email"] });
      pages.push(page);
      after = page.nextAfter ?? undefined;
    }
    expect(pages.map((page) => page.contacts[0]!.properties.email)).toEqual(["alice@example.com", "page-one@example.com", "page-two@example.com"]);
    expect(pages.map((page) => page.nextAfter)).toEqual(["601", "602", null]);
    expect(new Set(pages.flatMap((page) => page.contacts.map((c) => c.id))).size).toBe(3);
    expect(await fake.state("hubspot")).toEqual(before);
    const r = await fake.lastRequest("hubspot");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/crm/v3/objects/contacts");
    expect(r.headers["x-auth-scheme"]).toBe("bearer");
    expect(Object.fromEntries(queryOf(r))).toEqual({ limit: "1", after: "602", properties: "email", archived: "false" });
    expect(pages[0]!.contacts[0]!.properties).toEqual({ email: "alice@example.com" });
  });

  it("keeps defined-but-unset properties null and omits undefined properties", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    await runAction("hubspot.upsert_contact", ctx, { email: "unset@example.com" });
    const page = await runAction<Page>("hubspot.list_contacts", ctx, { after: "601", properties: ["email", "firstname", "undefined_property"] });
    expect(page).toEqual({ contacts: [{ id: "601", properties: { email: "unset@example.com", firstname: null } }], nextAfter: null });
  });

  it("returns an empty final page", async () => {
    expect(await runAction("hubspot.list_contacts", makeCtx(p, apiKeyCreds), { after: "999999" })).toEqual({ contacts: [], nextAfter: null });
  });

  it("refuses revoked credentials at the HTTP boundary", async () => {
    await expectProviderError(runAction("hubspot.list_contacts", makeCtx(p, { type: "api_key", token: "revoked-token" }), {}), "auth");
  });

  it.each(["429", "500"] as const)("classifies HTTP %s for bounded retries", async (mode) => {
    await fake.fault({ provider: "hubspot", pathPattern: "^/crm/v3/objects/contacts$", mode, retryAfterSec: 1 });
    const e = await expectProviderError(runAction("hubspot.list_contacts", makeCtx(p, apiKeyCreds), {}), mode === "429" ? "rate_limit" : "server");
    expect(e.retryable).toBe(true);
    expect(e.message).toBe(`HubSpot request failed (${e.kind})`);
    if (mode === "429") expect(e.retryAfterMs).toBe(1000);
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
