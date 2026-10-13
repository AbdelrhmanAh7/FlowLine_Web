import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken } from "@/server/email/flows";
import { createWorkspace } from "@/server/workspaces";
import { addMember, closeDb, makeUser, unique } from "./helpers";
import { connect, pauseAfter, routeTransactions, blockedByObserver } from "./pg-lock-helpers";

// This test verifies the fix for issue #109 (part 2 of #47): the deletion now locks workspaces
// FOR UPDATE before writing audit rows, avoiding the KEY SHARE → FOR UPDATE upgrade that
// could deadlock two concurrent deletions (40P01). The retained-file accounting lock still
// serializes all deletions globally, but this lock order is safe even without it.
//
// This test uses fault injection (mocking out the accounting lock) to verify that the
// lock order fix alone prevents the deadlock: two co-members deleting at once should
// both complete successfully, serialized on the workspace FOR UPDATE lock.

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
  it("without the accounting lock, two co-members deleting at once serialize on workspace lock and both finish", async () => {
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
    // Get the second connection's PID before starting the transaction.
    const secondPid = (await secondClient.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
    // Pause the first deletion AFTER it acquires the workspace FOR UPDATE lock (before audit insert).
    // The second deletion will block on the workspace lock held by the first.
    const firstPause = pauseAfter(firstClient, /from "workspace"[\s\S]*for update/i);
    const routing = routeTransactions();
    let deletingFirst: Promise<unknown> | undefined;
    let deletingSecond: Promise<unknown> | undefined;
    try {
      deletingFirst = routing.run(firstDb, () => consumeAccountToken("delete", firstToken, undefined, first.id));
      await Promise.race([firstPause.reached, deletingFirst.then(() => { throw new Error("First deletion finished before its workspace lock"); })]);
      // First deletion now holds the workspace FOR UPDATE lock. Start the second deletion;
      // it will block on the workspace lock.
      deletingSecond = routing.run(secondDb, () => consumeAccountToken("delete", secondToken, undefined, second.id));
      // Give the second deletion time to reach the workspace lock and block.
      await new Promise((r) => setTimeout(r, 100));
      // Verify the second deletion is blocked on the workspace lock (observer is the first connection).
      const wait = await blockedByObserver(firstClient, secondPid, () => false);
      expect(wait.query).toContain("for update");
      // Resume the first deletion: it does the audit insert and commits, releasing the workspace lock.
      firstPause.resume();
      await expect(deletingFirst).resolves.toBe("done");
      // The second deletion should now acquire the workspace lock, do its audit insert, and commit.
      await expect(deletingSecond).resolves.toBe("done");
      // Both audit rows should exist.
      const audit = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, workspace.id), eq(schema.auditEvent.action, "account.deleted")));
      expect(audit.map((e) => e.targetId).sort()).toEqual([first.id, second.id].sort());
      // Both accounts should be deleted.
      expect(await db.select().from(schema.user).where(eq(schema.user.id, first.id))).toHaveLength(0);
      expect(await db.select().from(schema.user).where(eq(schema.user.id, second.id))).toHaveLength(0);
    } finally {
      firstPause.resume();
      await Promise.allSettled([deletingFirst, deletingSecond]);
      firstPause.restore();
      routing.restore();
      await Promise.all([firstClient.end(), secondClient.end()]);
    }
  });
});
