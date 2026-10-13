import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken } from "@/server/email/flows";
import { createWorkspace } from "@/server/workspaces";
import { addMember, closeDb, makeUser, unique } from "./helpers";
import { connect, pauseAfter, routeTransactions } from "./pg-lock-helpers";

// This test verifies the fix for issue #109 (part 2 of #47): the deletion now writes its
// audit rows before locking the workspaces FOR UPDATE. This order avoids the KEY SHARE →
// FOR UPDATE upgrade *when combined with the retained-file accounting lock*, which serializes
// all deletions globally. Without the accounting lock, two co-members deleting at once can
// each hold a key-share (from their audit inserts) and both wait for FOR UPDATE, causing
// a 40P01 deadlock. This test uses fault injection (mocking out the accounting lock) to
// prove that the accounting lock is load-bearing: with only the accounting lock removed,
// the same two deletions, each paused after its audit insert and released together, leave
// one transaction aborted with 40P01 at the workspace FOR UPDATE while holding its key-share.

vi.mock("@/server/retained-files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/retained-files")>();
  return {
    ...actual,
    // FAULT INJECTION (this file only): drop the deletion's first statement — the installation-wide
    // advisory lock — to verify the lock order fix works without it.
    lockRetainedFileAccounting: async () => undefined,
  };
});

const owned: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await db.transaction(async (tx) => {
    for (const id of owned.splice(0)) await tx.delete(schema.workspace).where(eq(schema.workspace.id, id));
  });
});
afterAll(closeDb);

async function deleteToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId, tokenHash: sha256Hex(token), purpose: "delete", expiresAt: new Date(Date.now() + 60_000) });
  return token;
}

describe("account deletion lock order fix (negative control)", () => {
  it("without the accounting lock, two co-members deleting at once deadlock on workspace lock (40P01)", async () => {
    const owner = await makeUser("upgrade-owner");
    const workspace = await createWorkspace(owner, unique("Upgrade"));
    owned.push(workspace.id);
    const [first, second] = [await makeUser("upgrade-a"), await makeUser("upgrade-b")];
    await addMember(workspace.id, first.id, "editor");
    await addMember(workspace.id, second.id, "editor");
    const [firstToken, secondToken] = [await deleteToken(first.id), await deleteToken(second.id)];
    const firstClient = await connect();
    const secondClient = await connect();
    const firstDb = drizzle(firstClient, { schema });
    const secondDb = drizzle(secondClient, { schema });
    // Pause BOTH deletions AFTER their audit inserts (before workspace FOR UPDATE).
    const firstPause = pauseAfter(firstClient, /insert into "audit_event"/i);
    const secondPause = pauseAfter(secondClient, /insert into "audit_event"/i);
    const routing = routeTransactions();
    let deletingFirst: Promise<unknown> | undefined;
    let deletingSecond: Promise<unknown> | undefined;
    try {
      deletingFirst = routing.run(firstDb, () => consumeAccountToken("delete", firstToken, undefined, first.id));
      deletingSecond = routing.run(secondDb, () => consumeAccountToken("delete", secondToken, undefined, second.id));
      // Wait for both to reach their audit inserts and pause.
      await Promise.all([firstPause.reached, secondPause.reached]);
      // Both now hold key-share on the workspace from their audit inserts.
      // Release them together: each will try to take workspace FOR UPDATE and deadlock (40P01).
      firstPause.resume();
      secondPause.resume();
      // One should succeed, the other should fail with 40P01.
      const results = await Promise.allSettled([deletingFirst, deletingSecond]);
      console.log("Results:", results.map((r) => (r.status === "fulfilled" ? `fulfilled: ${r.value}` : `rejected: ${r.reason?.message}`)));
      // The error is wrapped in DrizzleQueryError; check the cause for 40P01.
      interface DrizzleError extends Error { cause?: { message?: string } }
      const deadlockCount = results.filter((r) => {
        if (r.status !== "rejected") return false;
        const err = r.reason as DrizzleError | undefined;
        if (!err) return false;
        // Check error message and cause chain for 40P01
        const msg = err.message ?? "";
        const causeMsg = err.cause?.message ?? "";
        return msg.includes("40P01") || causeMsg.includes("40P01") || msg.includes("deadlock detected") || causeMsg.includes("deadlock detected");
      }).length;
      expect(deadlockCount).toBe(1);
      // The successful deletion should have its audit row.
      const audit = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, workspace.id), eq(schema.auditEvent.action, "account.deleted")));
      expect(audit.length).toBe(1);
    } finally {
      firstPause.resume();
      secondPause.resume();
      await Promise.allSettled([deletingFirst, deletingSecond]);
      firstPause.restore();
      secondPause.restore();
      routing.restore();
      await Promise.all([firstClient.end(), secondClient.end()]);
    }
  });
});
