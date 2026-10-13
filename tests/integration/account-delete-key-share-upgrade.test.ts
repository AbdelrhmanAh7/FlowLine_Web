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

// Root cause (issue #109, part 2 of #47): a deletion inserts its "account.deleted" audit rows — each
// insert key-share locks its `workspace` row through the foreign key — and only then locks those
// workspaces `FOR UPDATE`. Two co-members of one workspace deleting at once would each hold that
// key-share while both wait for the other's to clear: the classic lock-upgrade cycle, which PostgreSQL
// aborts with 40P01. Every deletion therefore takes the installation-wide retained-file accounting lock
// (`lockRetainedFileAccounting`, a `pg_advisory_xact_lock` plus the singleton counter row) as its first
// statement, so two deletions are never past their audit inserts at the same time
// (tests/integration/retained-file-locking.test.ts, "two co-members of one workspace").
//
// This negative control proves that hazard is real and the accounting lock is load-bearing: with ONLY
// that lock removed (a test-only mock — fault injection, this file alone), the real
// `consumeAccountToken("delete")` of two co-members, each paused right after its audit insert and
// released at once, must leave one transaction aborted with 40P01 while the other commits. The
// production path cannot reach that state, which is exactly what the retained-file-locking test pins.

vi.mock("@/server/retained-files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/retained-files")>();
  return {
    ...actual,
    // FAULT INJECTION (this file only): drop the deletion's first statement — the installation-wide
    // advisory lock — to expose the key-share → FOR UPDATE upgrade it exists to serialize.
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

describe("account deletion key-share upgrade (negative control)", () => {
  it("without the accounting lock, two co-members deleting at once deadlock (40P01)", async () => {
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
    // Both deletions pause right after their audit insert: each holds FOR KEY SHARE on the shared
    // workspace and neither has asked for the workspace FOR UPDATE yet.
    const firstPause = pauseAfter(firstClient, /insert into "audit_event"/i);
    const secondPause = pauseAfter(secondClient, /insert into "audit_event"/i);
    const routing = routeTransactions();
    let deletingFirst: Promise<unknown> | undefined;
    let deletingSecond: Promise<unknown> | undefined;
    try {
      deletingFirst = routing.run(firstDb, () => consumeAccountToken("delete", firstToken, undefined, first.id));
      await Promise.race([firstPause.reached, deletingFirst.then(() => { throw new Error("First deletion finished before its audit insert"); })]);
      deletingSecond = routing.run(secondDb, () => consumeAccountToken("delete", secondToken, undefined, second.id));
      await Promise.race([secondPause.reached, deletingSecond.then(() => { throw new Error("Second deletion finished before its audit insert"); })]);
      // Released together, each asks for the workspace FOR UPDATE while the other still holds the
      // key-share its own audit insert took: the upgrade cycle. PostgreSQL must abort one (40P01).
      firstPause.resume();
      secondPause.resume();
      const [firstResult, secondResult] = await Promise.allSettled([deletingFirst, deletingSecond]);
      // Drizzle wraps the PostgreSQL error, whose SQLSTATE is on `cause`.
      const sqlState = (r: PromiseRejectedResult) => {
        const reason = r.reason as { code?: string; cause?: { code?: string } } | null;
        return reason?.code ?? reason?.cause?.code;
      };
      const deadlocked = [firstResult, secondResult].filter((r) => r.status === "rejected" && sqlState(r) === "40P01");
      expect(deadlocked).toHaveLength(1);
      const finished = [firstResult, secondResult].filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled");
      expect(finished).toHaveLength(1);
      expect(finished[0]!.value).toBe("done");
      // The aborted transaction rolled back (no audit row, account still there); the survivor's audit
      // row stays and its account is gone.
      const survivor = firstResult.status === "fulfilled" ? first : second;
      const aborted = firstResult.status === "fulfilled" ? second : first;
      expect(await db.select().from(schema.user).where(eq(schema.user.id, survivor.id))).toHaveLength(0);
      expect(await db.select().from(schema.user).where(eq(schema.user.id, aborted.id))).toHaveLength(1);
      const audit = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, workspace.id), eq(schema.auditEvent.action, "account.deleted")));
      expect(audit.map((e) => e.targetId)).toEqual([survivor.id]);
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
