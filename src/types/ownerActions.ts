/**
 * Types and read-only contract stub for Owner Actions (PP-02..PP-09).
 *
 * Scope: Non-sensitive scaffolding only (PP-02..PP-09 checklist items for the paid pilot).
 * Real payments, pricing calculations, legal terms, credentials, and user contact
 * remain strictly owner-only (#30, #162).
 */

export type OwnerActionStatus = "pending" | "done" | "blocked";

export type OwnerActionBlockedBy = "money" | "legal" | "people";

export type OwnerActionId =
  | "PP-02"
  | "PP-03"
  | "PP-04"
  | "PP-05"
  | "PP-06"
  | "PP-07"
  | "PP-08"
  | "PP-09";

export interface OwnerActionRow {
  readonly id: OwnerActionId;
  readonly title: string;
  readonly status: OwnerActionStatus;
  readonly blockedBy?: OwnerActionBlockedBy;
}

export interface OwnerActionsStatusResponse {
  readonly actions: readonly OwnerActionRow[];
}

/**
 * Static read-only contract stub for PP-02..PP-09 checklist rows.
 * Marked honestly as pending or blocked; no fake success states.
 * No API routes that mutate anything, no provider calls, no secrets.
 */
export const OWNER_ACTIONS_PP_ROWS: readonly OwnerActionRow[] = [
  {
    id: "PP-02",
    title: "Owner sign-in, admin MFA",
    status: "blocked",
    blockedBy: "people",
  },
  {
    id: "PP-03",
    title: "Real provider integrations setup",
    status: "blocked",
    blockedBy: "money",
  },
  {
    id: "PP-04",
    title: "AI provider accounts and models",
    status: "blocked",
    blockedBy: "money",
  },
  {
    id: "PP-05",
    title: "Sandbox payments and billing configuration",
    status: "blocked",
    blockedBy: "money",
  },
  {
    id: "PP-06",
    title: "Approved deployment with restore, rollback and alerts",
    status: "blocked",
    blockedBy: "people",
  },
  {
    id: "PP-07",
    title: "Policies and legal terms finalization",
    status: "blocked",
    blockedBy: "legal",
  },
  {
    id: "PP-08",
    title: "Protected test configuration and key store",
    status: "blocked",
    blockedBy: "people",
  },
  {
    id: "PP-09",
    title: "CI billing and compute capacity",
    status: "blocked",
    blockedBy: "money",
  },
] as const;

/**
 * Read-only status getter returning the contract stub.
 * Read-only: no mutations, side-effects, or credentials.
 */
export function getOwnerActionsStatusStub(): OwnerActionsStatusResponse {
  return {
    actions: OWNER_ACTIONS_PP_ROWS,
  };
}
