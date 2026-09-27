import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { db, pool, schema } from "@/db";
import type { Role } from "@/db/schema";
import type { CurrentUser } from "@/server/access";
import { HttpError } from "@/server/http";
import { claimNextRun, processRun } from "../../worker/runner";

/** Short unique suffix so tests never depend on an empty DB. */
export function unique(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Inserts a user row directly (no better-auth HTTP) and returns a CurrentUser. */
export async function makeUser(prefix = "user"): Promise<CurrentUser> {
  const id = randomUUID();
  const email = `${prefix}-${randomUUID()}@flowline-test.local`;
  const name = unique(`Test ${prefix}`);
  await db.insert(schema.user).values({ id, email, name });
  return { id, email, name };
}

export async function addMember(workspaceId: string, userId: string, role: Role) {
  await db.insert(schema.workspaceMember).values({ workspaceId, userId, role });
}

/** Asserts the promise rejects with an HttpError of the given status/code and returns it. */
export async function expectHttpError(promise: Promise<unknown>, status: number, code?: string): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    const e = err as HttpError;
    expect(e.status).toBe(status);
    if (code !== undefined) expect(e.code).toBe(code);
    return e;
  }
  throw new Error(`Expected HttpError ${status}${code ? ` ${code}` : ""}, but the promise resolved`);
}

/**
 * Claims runs until `runId` is claimed, processing everything claimed along the
 * way, then processes the target. Stray queued runs left by earlier tests are
 * drained harmlessly, so tests stay independent of execution order.
 */
export async function claimAndProcess(runId: string, workerId = unique("worker")) {
  for (let i = 0; i < 25; i++) {
    const claimed = await claimNextRun(db, workerId);
    if (!claimed) throw new Error(`No queued run available; expected to claim ${runId}`);
    await processRun(db, claimed, workerId);
    if (claimed === runId) return;
  }
  throw new Error(`Never claimed ${runId} after 25 attempts`);
}

/** Re-reads a run row fresh from the DB (proves persistence, not return values). */
export async function freshRun(runId: string) {
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run) throw new Error(`Run ${runId} not found in DB`);
  return run;
}

export async function closeDb() {
  await pool.end();
}
