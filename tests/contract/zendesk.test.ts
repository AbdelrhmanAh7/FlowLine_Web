import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeCtx, provider, queryOf, runAction, startFake, zendeskCreds, type Fake } from "./helpers";

const p = provider("zendesk");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("zendesk identity", () => {
  it("authenticates with basic {email}/token and returns the agent", async () => {
    const id = await p.identity(makeCtx(p, zendeskCreds));
    expect(id).toEqual({ accountId: "360001", label: "Agent Smith <agent@flowline.test>" });
    const r = await fake.lastRequest("zendesk");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/api/v2/users/me.json");
    expect(r.headers["x-auth-scheme"]).toBe("basic");
  });
});

describe("zendesk.list_tickets", () => {
  it("searches type:ticket status<solved and returns the urgent outage ticket", async () => {
    const out = await runAction<{ tickets: { id: number; subject: string; priority: string | null }[] }>(
      "zendesk.list_tickets",
      makeCtx(p, zendeskCreds),
      {},
    );
    const urgent = out.tickets.find((t) => t.id === 101);
    expect(urgent?.subject).toBe("Urgent outage in eu-west");
    expect(urgent?.priority).toBe("urgent");
    const r = await fake.lastRequest("zendesk");
    expect(r.path).toBe("/api/v2/search.json");
    expect(queryOf(r).get("query")).toBe("type:ticket status<solved");
    expect(queryOf(r).get("per_page")).toBe("25");
  });

  it("appends extra search terms", async () => {
    const out = await runAction<{ tickets: { id: number }[] }>("zendesk.list_tickets", makeCtx(p, zendeskCreds), {
      query: "outage",
      limit: 5,
    });
    expect(out.tickets.map((t) => t.id)).toEqual([101]);
    const r = await fake.lastRequest("zendesk");
    expect(queryOf(r).get("query")).toBe("type:ticket status<solved outage");
  });
});

describe("zendesk.update_ticket", () => {
  it("PUTs field updates only", async () => {
    const out = await runAction<{ id: number; status: string }>("zendesk.update_ticket", makeCtx(p, zendeskCreds), {
      ticketId: 101,
      priority: "high",
      tags: ["outage", "eu-west", "mitigated"],
    });
    expect(out).toEqual({ id: 101, status: "open" });
    const r = await fake.lastRequest("zendesk");
    expect(r.method).toBe("PUT");
    expect(r.path).toBe("/api/v2/tickets/101.json");
    expect(r.body).toEqual({ ticket: { priority: "high", tags: ["outage", "eu-west", "mitigated"] } });
  });

  it("rejects input without any field to update", () => {
    const action = p.actions.find((a) => a.id === "zendesk.update_ticket")!;
    expect(() => action.input.parse({ ticketId: 101 })).toThrow();
  });
});
