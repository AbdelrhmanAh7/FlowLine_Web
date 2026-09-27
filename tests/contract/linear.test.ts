import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeyCreds, makeCtx, provider, runAction, runVerify, startFake, type Fake } from "./helpers";

const p = provider("linear");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("linear identity", () => {
  it("queries viewer with the raw API key (no Bearer scheme)", async () => {
    const id = await p.identity(makeCtx(p, apiKeyCreds));
    expect(id).toEqual({ accountId: "lin-user-1", label: "Alice A <alice@flowline.test>" });
    const r = await fake.lastRequest("linear");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/graphql");
    expect(r.headers["x-auth-scheme"]).toBe("raw");
    expect((r.body as { query: string }).query).toContain("viewer");
  });
});

describe("linear.list_teams", () => {
  it("lists teams", async () => {
    const out = await runAction<{ teams: { id: string; name: string; key: string }[] }>(
      "linear.list_teams",
      makeCtx(p, apiKeyCreds),
      {},
    );
    expect(out.teams).toEqual([{ id: "team-eng", name: "Engineering", key: "ENG" }]);
    const r = await fake.lastRequest("linear");
    expect((r.body as { query: string }).query).toContain("teams");
  });
});

describe("linear.create_issue", () => {
  it("creates an issue with the flowline marker in the description, and verify finds it", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    const input = { teamId: "team-eng", title: "Chase invoice INV-001", description: "Vendor: Acme Supplies" };
    const out = await runAction<{ id: string; identifier: string; url: string }>("linear.create_issue", ctx, input);
    expect(out.identifier).toMatch(/^ENG-/);

    const r = await fake.lastRequest("linear");
    const body = r.body as { query: string; variables: { input: { description: string; teamId: string } } };
    expect(body.query).toContain("issueCreate");
    expect(body.variables.input.teamId).toBe("team-eng");
    expect(body.variables.input.description).toBe(`Vendor: Acme Supplies\n\n<!-- flowline:${ctx.idempotencyKey} -->`);

    const v = await runVerify<{ id: string; identifier: string; title: string; url: string }>("linear.create_issue", ctx, input);
    expect(v.happened).toBe(true);
    expect(v.output?.id).toBe(out.id);
    const vr = await fake.lastRequest("linear");
    expect((vr.body as { variables: { needle: string } }).variables.needle).toBe(`flowline:${ctx.idempotencyKey}`);
  });

  it("verify reports happened:false when no issue carries the marker", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    const v = await runVerify("linear.create_issue", ctx, { teamId: "team-eng", title: "x", description: "" });
    expect(v.happened).toBe(false);
  });
});
