/**
 * Tests for `src/ai/hub/selection.ts` (#174). The issue names `selectEngineByScore` and `selectFreeEndpoint`, which never
 * existed in this repo (`git log --all -S "selectEngineByScore" -- src` is empty), so per the CTO decision on PR #183 the
 * real exports are tested and the first test pins that export list. Acceptance with this repo's Vitest (Jest's `--listTests`
 * is rejected as an unknown option): pnpm exec tsc --noEmit && pnpm exec vitest list --project unit --filesOnly | grep selection.spec
 */
import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as selection from "@/ai/hub/selection";
import type { FlowGraph } from "@/engine/types";

const { aiRoutesIn, assertRouteSelection, assertRoutesUsable, pinDefaultRoutes } = selection;
const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const R1 = { connectionId: C1, modelId: "m" };
const R2 = { connectionId: C2, modelId: "m" };
const BAD = { connectionId: "not-a-uuid", modelId: "m" };
const conn = (id: string, over: Record<string, unknown> = {}) => ({ id, label: `conn-${id.slice(0, 2)}`, status: "CONNECTED", useRoles: ["owner", "editor"], ...over });

/** Answers the `select().from().where()` queries in order (connections, then the member's role) and records each call. */
function fakeDb(...answers: unknown[][]) {
  const calls: unknown[] = [];
  const db = { select: (cols?: unknown) => (calls.push(cols), { from: () => ({ where: async () => answers.shift() ?? [] }) }) };
  return { db: db as unknown as Db, calls };
}

/** One node per step: an AI step unless `type` says otherwise, carrying the config fields selection.ts reads. */
type Step = { type?: string; route?: unknown; model?: string };
const graph = (...steps: Step[]) =>
  ({ nodes: steps.map(({ type = "ai.generate", ...config }, i) => ({ id: `n${i}`, type, position: { x: 0, y: 0 }, data: { label: `n${i}`, config } })), edges: [] }) as unknown as FlowGraph;

it("selection.ts exports exactly the four functions tested below; selectEngineByScore and selectFreeEndpoint do not exist", () => {
  expect(Object.keys(selection).sort()).toEqual(["aiRoutesIn", "assertRouteSelection", "assertRoutesUsable", "pinDefaultRoutes"]);
  expect(selection).not.toHaveProperty("selectEngineByScore");
  expect(selection).not.toHaveProperty("selectFreeEndpoint");
});

describe("assertRoutesUsable", () => {
  it("passes when every connection exists, is live and the member's role may use it", async () => {
    const { db, calls } = fakeDb([conn(C1), conn(C2)], [{ role: "editor" }]);
    await expect(assertRoutesUsable(db, "u", "w", [R1, R2])).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  // C1 is fine for an editor, so the editor rows prove every connection is checked, not only the first.
  it.each([
    ["missing", [conn(C1)], "editor", 422, "AI_CONNECTION_MISSING"],
    ["revoked", [conn(C1), conn(C2, { status: "REVOKED" })], "editor", 422, "AI_CONNECTION_REVOKED"],
    ["limited to other roles", [conn(C1), conn(C2, { useRoles: ["owner"] })], "editor", 403, "AI_ROUTE_FORBIDDEN"],
    ["used by a viewer", [conn(C1), conn(C2)], "viewer", 403, "AI_ROUTE_FORBIDDEN"],
  ])("refuses the routes when a connection is %s", async (_case, conns, role, status, code) => {
    const { db } = fakeDb(conns, [{ role }]);
    await expect(assertRoutesUsable(db, "u", "w", [R1, R2])).rejects.toMatchObject({ status, code });
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
    await assertRouteSelection(db, "u", "w", graph({ route: R1 }), graph({ route: R1 }));
    expect(calls).toHaveLength(0);
  });

  it("checks only routes that are new or changed", async () => {
    const { db, calls } = fakeDb([conn(C2)], [{ role: "owner" }]);
    await expect(assertRouteSelection(db, "u", "w", graph({ route: R1 }, { route: R2 }), graph({ route: R1 }))).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it.each([["a new flow", null], ["a step whose model changed", graph({ route: { ...R1, modelId: "old" } })]])("checks the route of %s", async (_case, prev) => {
    const { db } = fakeDb([], [{ role: "owner" }]);
    await expect(assertRouteSelection(db, "u", "w", graph({ route: R1 }), prev)).rejects.toMatchObject({ code: "AI_CONNECTION_MISSING" });
  });
});

describe("aiRoutesIn", () => {
  it("lists valid routes of AI steps only, skipping missing or malformed routes and non-AI steps", () => {
    expect(aiRoutesIn(graph({ route: R1 }, {}, { route: BAD }, { type: "transform.json", route: R2 }))).toEqual([R1]);
  });
});

describe("pinDefaultRoutes", () => {
  it("pins only a valid default, onto a step whose legacy model is blank but never onto a real legacy model", () => {
    const g = graph({ model: "gpt-4" }, { model: "  " });
    expect(pinDefaultRoutes(g, BAD)).toBe(g);
    expect(pinDefaultRoutes(g, R1).nodes.map((n) => (n.data.config as { route?: unknown }).route)).toEqual([undefined, R1]);
  });
});
