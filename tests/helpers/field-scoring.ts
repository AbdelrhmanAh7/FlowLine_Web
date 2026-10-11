import { createHash } from "node:crypto";

/**
 * Pure scoring helpers for the Company Builder field-validation harness (issue #141). They are used by the NEXT
 * validation round's `flowline-field/field.spec.ts`; the frozen run 20261001-d224cfb keeps its own scoring unchanged.
 */

/** Gap 1: approved policy sentences (and the draft's own "nothing has been … yet" disclaimer) are not promises. */
export function scoreNoPromise(replyText: string, forbidden: string, approvedInformation: readonly string[]): boolean {
  let low = replyText.toLowerCase();
  for (const line of [...approvedInformation, "nothing has been refunded or cancelled yet"]) low = low.split(line.toLowerCase()).join(" ");
  return !low.includes(forbidden.toLowerCase());
}

export type ReviewGateObservation = {
  outboxBefore: number;
  outboxAfterRequest: number;
  statusAfterRequest: string | undefined;
  outboxAfterApproval: number;
  statusAfterApproval: string | undefined;
};

/** Gap 2: requesting a review sends nothing; only the owner's approval writes exactly one outbox entry. */
export function scoreReviewGate(o: ReviewGateObservation): Record<string, boolean> {
  return {
    pendingAfterRequest: o.statusAfterRequest === "pending",
    nothingSentBeforeApproval: o.outboxAfterRequest === o.outboxBefore,
    executedAfterApproval: o.statusAfterApproval === "executed",
    exactlyOneSentAfterApproval: o.outboxAfterApproval === o.outboxAfterRequest + 1,
  };
}

/** Gap 3: after a duplicate trial the persisted run records must be the same record, not a second different one. */
export function compareFollowUpRecords(first: unknown, again: unknown): { sameKey: boolean; identical: boolean } {
  const a = (first ?? {}) as Record<string, unknown>;
  const b = (again ?? {}) as Record<string, unknown>;
  return { sameKey: typeof a.key === "string" && a.key === b.key, identical: JSON.stringify(a) === JSON.stringify(b) };
}

/** Gap 4: every `<sha256>  <file>` line of SHA256SUMS must match the file's real digest before it is recorded. */
export function verifyPacketDigest(sums: string, readFile: (name: string) => Buffer | string): { ok: boolean; mismatches: string[]; digest: string | null } {
  const mismatches: string[] = [];
  let digest: string | null = null;
  const lines = sums.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line);
    if (!m) {
      mismatches.push(`unparseable line: ${line}`);
      continue;
    }
    const actual = createHash("sha256").update(readFile(m[2]!)).digest("hex");
    if (actual !== m[1]!.toLowerCase()) mismatches.push(m[2]!);
    else digest ??= actual;
  }
  if (lines.length === 0) mismatches.push("empty SHA256SUMS");
  return { ok: mismatches.length === 0, mismatches, digest: mismatches.length === 0 ? digest : null };
}
