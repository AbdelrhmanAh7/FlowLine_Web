import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeyCreds, makeCtx, provider, runAction, startFake, type Fake } from "./helpers";

const p = provider("notion");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("notion identity", () => {
  it("returns the bot user with the Notion-Version header", async () => {
    const id = await p.identity(makeCtx(p, apiKeyCreds));
    expect(id).toEqual({ accountId: "bot-fake-1", label: "Flowline Bot" });
    const r = await fake.lastRequest("notion");
    expect(r.path).toBe("/v1/users/me");
    expect(r.headers["notion-version"]).toBe("2022-06-28");
  });
});

describe("notion.query_database", () => {
  it("POSTs a database query and returns pages", async () => {
    const out = await runAction<{ results: { id: string }[]; has_more: boolean; next_cursor: string | null }>(
      "notion.query_database",
      makeCtx(p, apiKeyCreds),
      { databaseId: "db-invoices", pageSize: 10 },
    );
    expect(out.results[0]!.id).toBe("page-seed-1");
    expect(out.has_more).toBe(false);
    const r = await fake.lastRequest("notion");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/databases/db-invoices/query");
    expect(r.headers["notion-version"]).toBe("2022-06-28");
    expect(r.body).toEqual({ page_size: 10 });
  });
});

describe("notion.create_page", () => {
  it("creates a page under a database parent", async () => {
    const out = await runAction<{ id: string; url: string }>("notion.create_page", makeCtx(p, apiKeyCreds), {
      parentDatabaseId: "db-invoices",
      properties: { Name: { title: [{ text: { content: "Invoice INV-001" } }] } },
    });
    expect(out.id).toMatch(/^page-fake-/);
    const r = await fake.lastRequest("notion");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/pages");
    expect((r.body as { parent: unknown }).parent).toEqual({ database_id: "db-invoices" });
  });

  it("requires exactly one parent", () => {
    const action = p.actions.find((a) => a.id === "notion.create_page")!;
    expect(() => action.input.parse({ properties: {} })).toThrow();
    expect(() => action.input.parse({ parentDatabaseId: "a", parentPageId: "b", properties: {} })).toThrow();
  });
});
