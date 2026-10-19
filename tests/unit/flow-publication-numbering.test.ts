import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { schema } from "@/db";
import { insertVersion } from "@/server/flows";

vi.mock("@/db", async () => ({ db: {}, schema: await import("@/db/schema") }));

describe("publication numbering (#204)", () => {
  it("save, overwrite and two runs consume no publication numbers", async () => {
    type Snapshot = typeof schema.flowVersion.$inferInsert;
    const snapshots: Snapshot[] = [];
    const predicates: SQL[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: async (predicate: SQL) => {
        predicates.push(predicate);
        return [{ next: Math.max(0, ...snapshots.map((s) => s.version ?? 0)) + 1 }];
      } }) }),
      insert: () => ({ values: (snapshot: Snapshot) => ({ returning: async () => {
        snapshots.push(snapshot);
        return [snapshot];
      } }) }),
    } as unknown as Parameters<typeof insertVersion>[0];
    const user = { id: "owner", email: "owner@flowline-test.local", name: "Owner" };
    const flow: typeof schema.flow.$inferSelect = {
      id: "flow-204", workspaceId: "workspace-204", revision: 1, name: "Flow", graph: { nodes: [], edges: [] },
      createdBy: user.id, updatedBy: user.id, createdAt: new Date(0), updatedAt: new Date(0),
      templateId: null, publishedVersionId: null, publishedBy: null, pausedReason: null, pausedAt: null, deletedAt: null,
    };
    const snapshot = (reason: Parameters<typeof insertVersion>[3]) => insertVersion(tx, user, flow, reason);

    expect((await snapshot("save")).version).toBeNull();
    expect((await snapshot("overwrite")).version).toBeNull();
    const published = await snapshot("publish");
    expect(published.version).toBe(1);
    expect((await snapshot("run")).version).toBeNull();
    expect((await snapshot("run")).version).toBeNull();
    expect(published.version).toBe(1);
    expect((await snapshot("save")).version).toBeNull();
    expect((await snapshot("overwrite")).version).toBeNull();
    expect((await snapshot("publish")).version).toBe(2);
    expect(snapshots.map((s) => s.version)).toEqual([null, null, 1, null, null, null, null, 2]);
    expect(predicates).toHaveLength(2);
    for (const predicate of predicates) {
      const query = new PgDialect().sqlToQuery(predicate);
      expect(query.sql).toContain('"flow_version"."flow_id" = $1');
      expect(query.sql).toContain('"flow_version"."reason" = $2');
      expect(query.params).toEqual([flow.id, "publish"]);
    }
  });
});
