import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { aiRoutesIn, assertRouteSelection, assertRoutesUsable, pinDefaultRoutes } from "@/ai/hub/selection";
import type { FlowGraph } from "@/engine/types";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const conn = (id: string, over: Record<string, unknown> = {}) => ({ id, label: `conn-${id.slice(0, 2)}`, status: "CONNECTED", useRoles: ["owner", "editor"], ...over });

/** Same call shape as drizzle: `await db.select(..).from(..).where(..)`; answers the queries in order. */
function fakeDb(...answers: unknown[][]) {
  const calls: unknown[] = [];
  const db = { select: (cols?: unknown) => (calls.push(cols), { from: () => ({ where: async () => answers.shift() ?? [] }) }) };
  return { db: db as unknown as Db, calls };
}

const graph = (...routes: (object | undefined)[]): FlowGraph => ({
  nodes: routes.map((route, i) => ({ id: `n${i}`, type: "ai.generate", position: { x: 0, y: 0 }, data: { label: `n${i}`, config: { instructions: "x", route } } })),
  edges: [],
}) as unknown as FlowGraph;

describe("assertRoutesUsable", () => {
  it("passes when every connection exists, is live and the member's role may use it", async () => {
    const { db, calls } = fakeDb([conn(C1)], [{ role: "editor" }]);
    await expect(assertRoutesUsable(db, "u", "w", [{ connectionId: C1, modelId: "m" }])).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["missing", [], "editor", "AI_CONNECTION_MISSING"],
    ["revoked", [conn(C1, { status: "REVOKED" })], "editor", "AI_CONNECTION_REVOKED"],
    ["viewer role", [conn(C1)], "viewer", "AI_ROUTE_FORBIDDEN"],
    ["role not in useRoles", [conn(C1, { useRoles: ["owner"] })], "editor", "AI_ROUTE_FORBIDDEN"],
  ])("refuses a %s connection", async (_case, conns, role, code) => {
    const { db } = fakeDb(conns, [{ role }]);
    await expect(assertRoutesUsable(db, "u", "w", [{ connectionId: C1, modelId: "m" }])).rejects.toMatchObject({ code });
  });

  it("does not query the database for an empty route list", async () => {
    const { db, calls } = fakeDb();
    await assertRoutesUsable(db, "u", "w", []);
    expect(calls).toHaveLength(0);
  });
});

describe("assertRouteSelection", () => {
  it("leaves unchanged routes alone, even on a connection the saver may not use", async () => {
    const { db, calls } = fakeDb();
    const g = graph({ connectionId: C1, modelId: "m" });
    await assertRouteSelection(db, "u", "w", g, g);
    expect(calls).toHaveLength(0);
  });

  it("checks only routes that are new or changed", async () => {
    const { db } = fakeDb([], [{ role: "owner" }]);
    const prev = graph({ connectionId: C1, modelId: "m" });
    const next = graph({ connectionId: C1, modelId: "m" }, { connectionId: C2, modelId: "m" });
    await expect(assertRouteSelection(db, "u", "w", next, prev)).rejects.toMatchObject({ code: "AI_CONNECTION_MISSING" });
  });
});

describe("aiRoutesIn", () => {
  it("lists valid routes of AI steps and skips missing or malformed ones", () => {
    expect(aiRoutesIn(graph({ connectionId: C1, modelId: "m" }, undefined, { connectionId: "not-a-uuid", modelId: "m" }))).toEqual([{ connectionId: C1, modelId: "m" }]);
  });
});

describe("pinDefaultRoutes", () => {
  const def = { connectionId: C1, modelId: "m" };

  it("returns the same graph when the default route is not valid", () => {
    const g = graph(undefined);
    expect(pinDefaultRoutes(g, { connectionId: "not-a-uuid", modelId: "m" })).toBe(g);
  });

  it("leaves a step with a legacy model string unpinned", () => {
    const g = { nodes: [{ id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { instructions: "x", model: "gpt-4" } } }], edges: [] } as unknown as FlowGraph;
    const route = (pinDefaultRoutes(g, def).nodes[0]!.data.config as { route?: unknown }).route;
    expect(route).toBeUndefined();
  });
});
