import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AiRouteRef } from "@/db/schema";
import type { FlowGraph } from "@/engine/types";
import { HttpError } from "@/server/http";
import { assertRouteSelection, assertRoutesUsable, pinDefaultRoutes, aiRoutesIn } from "@/ai/hub/selection";
import { isRouteRef } from "@/ai/hub/routing";

type MockDb = {
  select: ReturnType<typeof vi.fn>;
};

describe("assertRouteSelection", () => {
  it("no changes: returns early", async () => {
    const db = vi.mocked<MockDb>({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          inArray: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toSQL: vi.fn().mockReturnValue(""),
              }),
            }),
          }),
        }),
      }),
    });
    const prev: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { instructions: "i", source: "$", maxTokens: 10 } } },
      ],
      edges: [],
    };
    const next: FlowGraph = {
      nodes: [{ ...prev.nodes[0] }],
      edges: [],
    };
    await assertRouteSelection(db, "u", "w", next, prev);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("valid route change: calls assertRoutesUsable", async () => {
    const connId = randomUUID();
    const db = vi.mocked<MockDb>({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          inArray: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toSQL: vi.fn().mockReturnValue(""),
              }),
            }),
          }),
        }),
      }),
    });
    const conn = { id: connId, workspaceId: "w", status: "CONNECTED", label: "c", provider: "openai", settings: {}, secretEnc: null, keyId: null };
    const member = { userId: "u", workspaceId: "w", role: "owner" };
    db.select.mockImplementationOnce(() => Promise.resolve([conn]));
    db.select.mockImplementationOnce(() => Promise.resolve([member]));
    const prev: FlowGraph = { nodes: [], edges: [] };
    const next: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { instructions: "i", source: "$", maxTokens: 10 } } },
      ],
      edges: [],
    };
    await assertRouteSelection(db, "u", "w", next, prev);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("invalid connection: throws AI_CONNECTION_MISSING", async () => {
    const db = vi.mocked<MockDb>({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          inArray: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toSQL: vi.fn().mockReturnValue(""),
              }),
            }),
          }),
        }),
      }),
    });
    const member = { userId: "u", workspaceId: "w", role: "owner" };
    db.select.mockImplementationOnce(() => Promise.resolve([]));
    db.select.mockImplementationOnce(() => Promise.resolve([member]));
    const next: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { instructions: "i", source: "$", maxTokens: 10 } } },
      ],
      edges: [],
    };
    await expect(assertRouteSelection(db, "u", "w", next, null)).rejects.toThrow(HttpError);
    await expect(assertRouteSelection(db, "u", "w", next, null)).rejects.toThrow("AI_CONNECTION_MISSING");
  });
});

describe("assertRoutesUsable", () => {
  it("no routes: returns early", async () => {
    const db = vi.mocked<MockDb>({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          inArray: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toSQL: vi.fn().mockReturnValue(""),
              }),
            }),
          }),
        }),
      }),
    });
    await assertRoutesUsable(db, "u", "w", []);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("revoked connection: throws AI_CONNECTION_REVOKED", async () => {
    const connId = randomUUID();
    const db = vi.mocked<MockDb>({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          inArray: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toSQL: vi.fn().mockReturnValue(""),
              }),
            }),
          }),
        }),
      }),
    });
    const conn = { id: connId, workspaceId: "w", status: "REVOKED", label: "c", provider: "openai", settings: {}, secretEnc: null, keyId: null };
    const member = { userId: "u", workspaceId: "w", role: "owner" };
    db.select.mockImplementationOnce(() => Promise.resolve([conn]));
    db.select.mockImplementationOnce(() => Promise.resolve([member]));
    await expect(assertRoutesUsable(db, "u", "w", [{ connectionId: connId, modelId: "m" }])).rejects.toThrow(HttpError);
    await expect(assertRoutesUsable(db, "u", "w", [{ connectionId: connId, modelId: "m" }])).rejects.toThrow("AI_CONNECTION_REVOKED");
  });

  it("forbidden route: throws AI_ROUTE_FORBIDDEN", async () => {
    const connId = randomUUID();
    const db = vi.mocked<MockDb>({
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          inArray: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toSQL: vi.fn().mockReturnValue(""),
              }),
            }),
          }),
        }),
      }),
    });
    const conn = { id: connId, workspaceId: "w", status: "CONNECTED", label: "c", provider: "openai", settings: {}, secretEnc: null, keyId: null };
    const member = { userId: "u", workspaceId: "w", role: "member" };
    db.select.mockImplementationOnce(() => Promise.resolve([conn]));
    db.select.mockImplementationOnce(() => Promise.resolve([member]));
    await expect(assertRoutesUsable(db, "u", "w", [{ connectionId: connId, modelId: "m" }])).rejects.toThrow(HttpError);
    await expect(assertRoutesUsable(db, "u", "w", [{ connectionId: connId, modelId: "m" }])).rejects.toThrow("AI_ROUTE_FORBIDDEN");
  });
});

describe("pinDefaultRoutes", () => {
  it("null/default: returns graph unchanged", () => {
    const g: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: {} } },
      ],
      edges: [],
    };
    expect(pinDefaultRoutes(g, null)).toBe(g);
    expect(pinDefaultRoutes(g, undefined)).toBe(g);
  });

  it("steps with own route: unchanged", () => {
    const def: AiRouteRef = { connectionId: randomUUID(), modelId: "m" };
    const own: AiRouteRef = { connectionId: randomUUID(), modelId: "own" };
    const g: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { route: own } } },
      ],
      edges: [],
    };
    expect(pinDefaultRoutes(g, def)).toBe(g);
  });

  it("steps with legacy model: unchanged", () => {
    const def: AiRouteRef = { connectionId: randomUUID(), modelId: "m" };
    const g: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { model: "old-local" } } },
      ],
      edges: [],
    };
    expect(pinDefaultRoutes(g, def)).toBe(g);
  });

  it("steps without route/model: gets default route", () => {
    const def: AiRouteRef = { connectionId: randomUUID(), modelId: "m" };
    const g: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: {} } },
      ],
      edges: [],
    };
    const pinned = pinDefaultRoutes(g, def);
    const route = (pinned.nodes[0]!.data.config as { route?: unknown }).route;
    expect(isRouteRef(route)).toBe(true);
    expect(route).toEqual(def);
    expect(pinned).not.toBe(g);
  });
});

describe("aiRoutesIn", () => {
  it("extracts routes from AI steps", () => {
    const g: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: {} } },
        { id: "b", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "b", config: {} } },
        { id: "c", type: "transform.json", position: { x: 0, y: 0 }, data: { label: "c", config: {} } },
      ],
      edges: [],
    };
    const routes = aiRoutesIn(g);
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => isRouteRef(r))).toBe(true);
  });
});
