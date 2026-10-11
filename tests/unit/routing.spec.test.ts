import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import type { AiPolicy } from "@/db/schema";
import { deferFor, isRouteRef, resolveRoute, routeSnapshot } from "@/ai/hub/routing";
import type { ResolvedRoute } from "@/ai/hub/types";

const CONN = "6f1d2c3a-1111-4222-8333-444455556666";
const db = {} as Db;
const ws = (o: Record<string, unknown> = {}) => ({ id: "w1", aiProvider: null, aiDefaultRoute: null, prices: {}, currency: "USD", ...o }) as never;

describe("hub routing (no database)", () => {
  it("deferFor defers unavailable models only when the workspace policy has other routes to try", () => {
    expect(deferFor({ aiPolicy: { mode: "MANUAL", allowUnknownCost: false } as AiPolicy })).toEqual({ deferUnavailable: false });
    expect(deferFor({ aiPolicy: { mode: "FALLBACK", allowUnknownCost: false } as AiPolicy })).toEqual({ deferUnavailable: true });
    expect(deferFor({ aiPolicy: null as never })).toEqual({ deferUnavailable: false });
  });

  it("isRouteRef accepts only a UUID connection and a non-empty model id up to 200 chars", () => {
    expect(isRouteRef({ connectionId: CONN, modelId: "gpt-x" })).toBe(true);
    expect(isRouteRef({ connectionId: "not-a-uuid", modelId: "gpt-x" })).toBe(false);
    expect(isRouteRef({ connectionId: CONN, modelId: "" })).toBe(false);
    expect(isRouteRef({ connectionId: CONN, modelId: "m".repeat(201) })).toBe(false);
    expect(isRouteRef(null)).toBe(false);
  });

  it("routeSnapshot keeps identity fields only (no capabilities, pricing or free-tier data)", () => {
    const route = {
      kind: "workspace", provider: "p", connectionId: CONN, connectionLabel: "L", modelId: "m", protocol: "x", source: "explicit",
      capabilities: {}, pricing: { inputPerMTokMicros: 1 }, free: { zeroPriced: false, note: null },
    } as unknown as ResolvedRoute;
    expect(routeSnapshot(route)).toEqual({ provider: "p", connectionId: CONN, connectionLabel: "L", modelId: "m", protocol: "x", source: "explicit" });
  });

  it("with no route configured, resolveRoute throws AI_NOT_CONFIGURED", async () => {
    await expect(resolveRoute(db, ws(), {})).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });

  it("a legacy local (Ollama) workspace is refused, never reinterpreted", async () => {
    await expect(resolveRoute(db, ws({ aiProvider: "ollama" }), {})).rejects.toMatchObject({ code: "AI_LOCAL_MIGRATION_REQUIRED" });
    await expect(resolveRoute(db, ws({ aiProvider: "ollama" }), { legacyModel: "llama3" })).rejects.toMatchObject({ code: "AI_LOCAL_MIGRATION_REQUIRED" });
  });

  it("a pin with a malformed connection id throws AI_CONNECTION_MISSING", async () => {
    await expect(resolveRoute(db, ws(), { pin: { connectionId: "bad", modelId: "m" } })).rejects.toMatchObject({ code: "AI_CONNECTION_MISSING" });
  });

  it("a legacy model name without a default route throws AI_ROUTE_MIGRATION_REQUIRED", async () => {
    await expect(resolveRoute(db, ws(), { legacyModel: "gpt-4o" })).rejects.toMatchObject({ code: "AI_ROUTE_MIGRATION_REQUIRED" });
  });
});
