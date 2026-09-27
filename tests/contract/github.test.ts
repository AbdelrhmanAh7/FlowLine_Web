import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeyCreds, makeCtx, provider, queryOf, runAction, runVerify, startFake, type Fake } from "./helpers";

const p = provider("github");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("github identity", () => {
  it("returns the user with GitHub API headers", async () => {
    const id = await p.identity(makeCtx(p, apiKeyCreds));
    expect(id).toEqual({ accountId: "1001", label: "alice" });
    const r = await fake.lastRequest("github");
    expect(r.path).toBe("/user");
    expect(r.headers.accept).toBe("application/vnd.github+json");
    expect(r.headers["x-github-api-version"]).toBe("2022-11-28");
  });

  it("a second token maps to a different account", async () => {
    const id = await p.identity(makeCtx(p, { type: "api_key", token: "second-account-token" }));
    expect(id).toEqual({ accountId: "1002", label: "bob" });
  });
});

describe("github.get_pull_request", () => {
  it("fetches PR #7", async () => {
    const out = await runAction<{ number: number; title: string; merged: boolean; head: string; base: string }>(
      "github.get_pull_request",
      makeCtx(p, apiKeyCreds),
      { owner: "flowline", repo: "demo", number: 7 },
    );
    expect(out).toMatchObject({ number: 7, title: "Add risky migration", state: "open", merged: false, head: "feat/risky-migration", base: "main" });
    const r = await fake.lastRequest("github");
    expect(r.path).toBe("/repos/flowline/demo/pulls/7");
  });
});

describe("github.list_pr_files", () => {
  it("lists files including the risky migration", async () => {
    const out = await runAction<{ files: { filename: string; status: string; patch?: string }[] }>(
      "github.list_pr_files",
      makeCtx(p, apiKeyCreds),
      { owner: "flowline", repo: "demo", number: 7 },
    );
    const migration = out.files.find((f) => f.filename.includes("0042_risky"));
    expect(migration).toBeDefined();
    expect(migration!.patch).toContain("DROP TABLE");
    const r = await fake.lastRequest("github");
    expect(r.path).toBe("/repos/flowline/demo/pulls/7/files");
    expect(queryOf(r).get("per_page")).toBe("100");
  });
});

describe("github.create_issue_comment", () => {
  it("appends the hidden flowline marker, and verify finds it", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    const input = { owner: "flowline", repo: "demo", number: 7, body: "Reviewed: the migration drops a table." };
    const out = await runAction<{ id: number; url: string }>("github.create_issue_comment", ctx, input);
    expect(out.id).toBeGreaterThan(9000);

    const r = await fake.lastRequest("github");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/repos/flowline/demo/issues/7/comments");
    expect((r.body as { body: string }).body).toBe(`${input.body}\n\n<!-- flowline:${ctx.idempotencyKey} -->`);

    const v = await runVerify<{ id: number; url: string }>("github.create_issue_comment", ctx, input);
    expect(v.happened).toBe(true);
    expect(v.output?.id).toBe(out.id);
    const vr = await fake.lastRequest("github");
    expect(vr.method).toBe("GET");
    expect(queryOf(vr).get("per_page")).toBe("100");
  });

  it("verify reports happened:false when the marker is absent", async () => {
    const ctx = makeCtx(p, apiKeyCreds);
    const v = await runVerify("github.create_issue_comment", ctx, { owner: "flowline", repo: "demo", number: 7, body: "x" });
    expect(v.happened).toBe(false);
  });
});
