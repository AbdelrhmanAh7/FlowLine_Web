import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { createFlow } from "@/server/flows";
import { json, route } from "@/server/http";
import { HttpError } from "@/server/http";
import { cleanProps, track } from "@/server/telemetry";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

afterAll(closeDb);

const eventsFor = (workspaceId: string, name: string) => db.select().from(schema.productEvent).where(and(eq(schema.productEvent.workspaceId, workspaceId), eq(schema.productEvent.name, name)));
async function eventually<T>(fn: () => Promise<T[]>, n = 1) {
  for (let i = 0; i < 40; i++) {
    const rows = await fn();
    if (rows.length >= n) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return fn();
}

describe("product telemetry (P4-15)", () => {
  it("keeps only allow-listed scalar properties — no payloads, emails or secrets", () => {
    expect(cleanProps({ status: "succeeded", provider: "slack", email: "a@b.c", token: "xoxb-secret", payload: { x: 1 }, code: "X".repeat(200), attempts: 2 })).toEqual({
      status: "succeeded",
      provider: "slack",
      code: "X".repeat(80),
      attempts: 2,
    });
  });

  it("records workflow_created and template_used without the flow's content", async () => {
    const user = await makeUser("tel");
    const ws = await createWorkspace(user, unique("Tel"));
    await createFlow(user, ws.id, { templateId: "lead-qualifier" });
    const [created] = await eventually(() => eventsFor(ws.id, "workflow_created"));
    expect(created!.props).toEqual({ templateId: "lead-qualifier" });
    expect(created!.userId).toBe(user.id);
    expect(await eventually(() => eventsFor(ws.id, "template_used"))).toHaveLength(1);
  });

  it("every API response carries a correlation id; a 5xx is recorded as api_error with that id", async () => {
    const ok = route(async () => json({ ok: true }));
    const res = await ok(new Request("http://localhost/api/x", { headers: { "x-request-id": "req-abcdef12" } }), {});
    expect(res.headers.get("x-request-id")).toBe("req-abcdef12");
    const generated = await ok(new Request("http://localhost/api/x", { headers: { "x-request-id": "bad id with spaces!" } }), {});
    expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);

    const boom = route(async () => {
      throw new Error("kaboom with secret sk_live_123");
    });
    const r = await boom(new Request("http://localhost/api/y", { headers: { "x-request-id": "req-boom0001" } }), {});
    expect(r.status).toBe(500);
    expect((await r.json()).error.requestId).toBe("req-boom0001");
    const rows = await eventually(() => db.select().from(schema.productEvent).where(and(eq(schema.productEvent.name, "api_error"), eq(schema.productEvent.correlationId, "req-boom0001"))));
    expect(rows[0]!.props).toEqual({ code: "INTERNAL", httpStatus: 500 });

    const handled = route(async () => {
      throw new HttpError(404, "NOT_FOUND", "nope");
    });
    await handled(new Request("http://localhost/api/z", { headers: { "x-request-id": "req-4040404" } }), {});
    await new Promise((r) => setTimeout(r, 200));
    expect(await db.select().from(schema.productEvent).where(eq(schema.productEvent.correlationId, "req-4040404"))).toHaveLength(0); // 4xx aren't errors
  });

  it("a telemetry failure never breaks the caller", async () => {
    expect(() => track("api_error", { workspaceId: "not-a-uuid" }, { code: "X" })).not.toThrow();
  });
});
