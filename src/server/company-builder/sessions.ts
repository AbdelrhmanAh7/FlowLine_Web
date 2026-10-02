import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { AnswerError, answeredCount, applyAnswer, correctFact, emptyState, nextQuestion, previousQuestion, readiness } from "@/company-builder/interview";
import type { InterviewState } from "@/company-builder/model";
import { QUESTION_BANK_VERSION, QUESTION_BY_ID } from "@/company-builder/questions";
import type { CurrentUser } from "@/server/access";
import { canonicalJson } from "@/server/crypto";
import { HttpError, notFound } from "@/server/http";
import { unpublishFlow } from "@/server/publish";

export type SessionRow = typeof schema.cbSession.$inferSelect;

export function stateOf(row: SessionRow): InterviewState {
  const s = row.state as InterviewState;
  return { bankVersion: s.bankVersion ?? QUESTION_BANK_VERSION, facts: s.facts ?? {}, answers: s.answers ?? [], path: s.path ?? [] };
}

/** Everything the interview UI needs, derived from the stored state (no client-side rules). */
export function sessionView(row: SessionRow, cursor: string | null = null) {
  const state = stateOf(row);
  const next = nextQuestion(state);
  const current = cursor ? (QUESTION_BY_ID.get(cursor) ?? next) : next;
  const back = previousQuestion(state, current?.id ?? null);
  const ready = readiness(state);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    status: row.status,
    revision: row.revision,
    profileVersion: row.profileVersion,
    facts: state.facts,
    answered: answeredCount(state),
    question: current
      ? { id: current.id, target: current.target, kind: current.kind, options: current.options ?? null, maxLength: current.maxLength ?? null, allowUnknown: current.allowUnknown, sensitivity: current.sensitivity, department: current.department, current: state.facts[current.target] ?? null }
      : null,
    backTo: back?.id ?? null,
    readiness: ready,
    updatedAt: row.updatedAt,
  };
}

export async function createSession(user: CurrentUser, workspaceId: string) {
  const [row] = await db.insert(schema.cbSession).values({ workspaceId, state: emptyState(), createdBy: user.id }).returning();
  return row!;
}

export async function listSessions(workspaceId: string) {
  return db
    .select({ id: schema.cbSession.id, status: schema.cbSession.status, updatedAt: schema.cbSession.updatedAt, profileVersion: schema.cbSession.profileVersion, createdAt: schema.cbSession.createdAt })
    .from(schema.cbSession)
    .where(and(eq(schema.cbSession.workspaceId, workspaceId), isNull(schema.cbSession.deletedAt)))
    .orderBy(desc(schema.cbSession.updatedAt))
    .limit(20);
}

/** Loads a session of THIS workspace (another workspace's id is a 404, like every other resource). */
export async function requireSession(workspaceId: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw notFound("Session not found");
  const [row] = await db
    .select()
    .from(schema.cbSession)
    .where(and(eq(schema.cbSession.id, sessionId), eq(schema.cbSession.workspaceId, workspaceId), isNull(schema.cbSession.deletedAt)));
  if (!row) throw notFound("Session not found");
  return row;
}

export interface AnswerInput {
  questionId: string;
  value?: unknown;
  unknown?: boolean;
  /** Optimistic concurrency: the revision the client last saw. */
  revision: number;
  /** "correction" when editing from the review screen. */
  mode?: "answer" | "correction";
}

export async function answer(workspaceId: string, sessionId: string, input: AnswerInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.cbSession)
      .where(and(eq(schema.cbSession.id, sessionId), eq(schema.cbSession.workspaceId, workspaceId), isNull(schema.cbSession.deletedAt)))
      .for("update");
    if (!row) throw notFound("Session not found");
    if (row.status === "archived") throw new HttpError(409, "SESSION_ARCHIVED", "This interview was archived");
    if (row.revision !== input.revision) throw new HttpError(409, "REVISION_CONFLICT", "This interview changed in another tab", { revision: row.revision });
    let next: InterviewState;
    try {
      next = input.mode === "correction" ? correctFact(stateOf(row), input.questionId, input.value, input.unknown) : applyAnswer(stateOf(row), input.questionId, input.value, input.unknown);
    } catch (e) {
      if (e instanceof AnswerError) throw new HttpError(422, e.code, "That answer isn't valid for this question");
      throw e;
    }
    if (canonicalJson(stateOf(row).facts) !== canonicalJson(next.facts)) {
      // A reviewed or approved plan is a snapshot of the interview facts. Invalidate it in the same transaction as
      // the correction so it cannot be installed after an answer change.
      await tx.update(schema.cbBlueprint)
        .set({ status: "superseded", approvedBy: null, approvedAt: null })
        .where(and(eq(schema.cbBlueprint.sessionId, row.id), inArray(schema.cbBlueprint.status, ["review_required", "approved"])));
    }
    const [updated] = await tx
      .update(schema.cbSession)
      .set({ state: next, revision: row.revision + 1, updatedAt: new Date() })
      .where(eq(schema.cbSession.id, row.id))
      .returning();
    return updated!;
  });
}

/** Snapshots the current facts as a new immutable BusinessProfile version. */
export async function snapshotProfile(user: CurrentUser, workspaceId: string, sessionId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.cbSession).where(and(eq(schema.cbSession.id, sessionId), eq(schema.cbSession.workspaceId, workspaceId))).for("update");
    if (!row) throw notFound("Session not found");
    const state = stateOf(row);
    const [last] = await tx.select().from(schema.cbProfile).where(eq(schema.cbProfile.sessionId, sessionId)).orderBy(desc(schema.cbProfile.version)).limit(1);
    // Unchanged facts reuse the last profile (refresh/double-click never creates a new version).
    if (last && JSON.stringify(last.facts) === JSON.stringify(state.facts)) return { profile: last, session: row, created: false };
    const version = (last?.version ?? 0) + 1;
    const [profile] = await tx.insert(schema.cbProfile).values({ workspaceId, sessionId, version, facts: state.facts, createdBy: user.id }).returning();
    const [session] = await tx.update(schema.cbSession).set({ profileVersion: version, updatedAt: new Date() }).where(eq(schema.cbSession.id, sessionId)).returning();
    return { profile: profile!, session: session!, created: true };
  });
}

export async function archiveSession(workspaceId: string, sessionId: string) {
  await db.update(schema.cbSession).set({ status: "archived", updatedAt: new Date() }).where(and(eq(schema.cbSession.id, sessionId), eq(schema.cbSession.workspaceId, workspaceId)));
}

/**
 * Delete semantics: the interview, its profiles, blueprints, installation records, trials, reviews and CLI jobs are
 * removed (cascade). Flows and agents already created stay: they are ordinary workspace drafts the owner may have
 * edited, deleted separately from the Flows/Agents pages. Export first if the answers should be kept.
 */
export async function deleteSession(workspaceId: string, sessionId: string) {
  // Active tasks are withdrawn first (unpublished) so nothing stays published without its Company Builder record.
  const active = await db
    .select({ refId: schema.cbInstalledItem.refId })
    .from(schema.cbActivation)
    .innerJoin(schema.cbInstallation, eq(schema.cbInstallation.id, schema.cbActivation.installationId))
    .innerJoin(schema.cbBlueprint, eq(schema.cbBlueprint.id, schema.cbInstallation.blueprintId))
    .innerJoin(schema.cbInstalledItem, and(eq(schema.cbInstalledItem.installationId, schema.cbActivation.installationId), eq(schema.cbInstalledItem.taskId, schema.cbActivation.taskId), eq(schema.cbInstalledItem.kind, "flow")))
    .where(and(eq(schema.cbBlueprint.sessionId, sessionId), eq(schema.cbActivation.workspaceId, workspaceId), eq(schema.cbActivation.state, "active")));
  for (const a of active) await unpublishFlow(a.refId);
  await db.delete(schema.cbSession).where(and(eq(schema.cbSession.id, sessionId), eq(schema.cbSession.workspaceId, workspaceId)));
  return { unpublished: active.length };
}
