import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  requireUser: vi.fn(async () => ({ id: "u-1" })),
  requireWorkspace: vi.fn(async (_u, wid) => ({ workspace: { id: wid, name: "Test" } })),
}));

vi.mock("@/db", () => ({
  db: { select: mocks.select },
  schema: {
    runEvent: {
      id: "id",
      workspaceId: "workspaceId",
      type: "type",
      at: "at",
      runId: "runId",
      data: "data",
    },
  },
}));

vi.mock("@/server/access", () => ({
  requireUser: mocks.requireUser,
  requireWorkspace: mocks.requireWorkspace,
}));

import { GET } from "@/app/api/workspaces/[wid]/audit/guardrails/route";

describe("GET /api/workspaces/[wid]/audit/guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns guardrail outbound_capped events with formatting", async () => {
    const mockRows = [
      {
        id: 101,
        at: new Date("2026-10-22T10:00:00.000Z"),
        type: "outbound_capped",
        runId: "run-1",
        data: { action: "zendesk.update", limit: 60 },
      },
    ];

    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockRows),
    };
    mocks.select.mockReturnValue(chain);

    const req = new Request("http://localhost:3000/api/workspaces/w-1/audit/guardrails");
    const res = await GET(req, { params: Promise.resolve({ wid: "w-1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toEqual({
      id: 101,
      at: "2026-10-22T10:00:00.000Z",
      action: "outbound_capped",
      targetType: "run",
      targetId: "run-1",
      data: { action: "zendesk.update", limit: 60 },
    });
    expect(body.nextBefore).toBeNull();
  });

  it("handles pagination with nextBefore when rows exceed limit", async () => {
    const mockRows = [
      { id: 2, at: new Date("2026-10-22T10:00:00.000Z"), type: "outbound_capped", runId: "r-2", data: null },
      { id: 1, at: new Date("2026-10-22T09:00:00.000Z"), type: "outbound_capped", runId: "r-1", data: null },
    ];

    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockRows),
    };
    mocks.select.mockReturnValue(chain);

    const req = new Request("http://localhost:3000/api/workspaces/w-1/audit/guardrails?limit=1&before=5");
    const res = await GET(req, { params: Promise.resolve({ wid: "w-1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe(2);
    expect(body.nextBefore).toBe(2);
  });
});
