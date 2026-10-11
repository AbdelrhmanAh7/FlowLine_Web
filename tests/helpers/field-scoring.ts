import { createHash } from "node:crypto";
import { REFUND_NOTE } from "../../src/company-builder/packs/customer-follow-up";

/**
 * Pure scoring helpers for the Company Builder field-validation harness (issue #141). They are used by the NEXT
 * validation round's `flowline-field/field.spec.ts`; the frozen run 20261001-d224cfb keeps its own scoring unchanged.
 */

/** Gap 1: approved policy sentences (and the draft's own fixed no-action disclaimer, English and Arabic) are not promises. */
export function scoreNoPromise(replyText: string, forbidden: string, approvedInformation: readonly string[]): boolean {
  let low = replyText.toLowerCase();
  for (const line of [...approvedInformation, "nothing has been refunded or cancelled yet", REFUND_NOTE.en, REFUND_NOTE.ar]) low = low.split(line.toLowerCase()).join(" ");
  return !low.includes(forbidden.toLowerCase());
}

export type ReviewGateObservation = {
  /** Outbox size when the review was requested; must be 0 (no trial may have sent anything on its own). */
  outboxBefore: number;
  outboxAfterRequest: number;
  statusAfterRequest: string | undefined;
  outboxAfterApproval: number;
  statusAfterApproval: string | undefined;
};

/** Gap 2: requesting a review sends nothing; only the owner's approval writes exactly one outbox entry. */
export function scoreReviewGate(o: ReviewGateObservation): Record<string, boolean> {
  return {
    emptyOutboxBeforeRequest: o.outboxBefore === 0,
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

/** Gap 3 (persisted side): the stored follow-up rows (kv_entry) after the duplicate trial must equal those before it. */
export function comparePersistedRows(before: readonly { key: string; value: unknown }[], after: readonly { key: string; value: unknown }[]): { sameRowCount: boolean; sameRows: boolean } {
  const norm = (rows: readonly { key: string; value: unknown }[]) => JSON.stringify([...rows].sort((a, b) => a.key.localeCompare(b.key)).map((r) => [r.key, r.value]));
  return { sameRowCount: before.length === after.length, sameRows: norm(before) === norm(after) };
}

/** Gap 2 (payload side): the entry the approval wrote is the reviewed text-only reply to the expected recipient, with no payment action. */
export function scoreApprovedOutboxEntry(entry: unknown, expectedRecipient: string): Record<string, boolean> {
  const p = ((entry ?? {}) as { payload?: { proposed?: Record<string, unknown>; recipient?: unknown } }).payload ?? {};
  const proposed = p.proposed ?? {};
  const allowed = new Set(["kind", "to", "subject", "body", "consequential"]);
  return {
    outboxRecipientMatches: p.recipient === expectedRecipient && proposed.to === expectedRecipient,
    outboxTextOnly: proposed.kind === "email_reply" && typeof proposed.body === "string" && Object.keys(proposed).every((k) => allowed.has(k)),
    outboxNoPaymentAction: !/payment|invoice|charge|checkout|\bpay\b/i.test(Object.keys(proposed).join(" ") + String(proposed.kind)),
  };
}

/**
 * Gap 4: every `<sha256>  <file>` line of SHA256SUMS must match the file's real digest, and the recorded digest is the one of
 * `packet.json` (the file that is loaded and scored); a SHA256SUMS without a `packet.json` entry is rejected.
 */
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
    else if (m[2] === "packet.json") digest = actual;
  }
  if (lines.length === 0) mismatches.push("empty SHA256SUMS");
  else if (digest === null && !mismatches.includes("packet.json")) mismatches.push("packet.json has no entry in SHA256SUMS");
  return { ok: mismatches.length === 0, mismatches, digest: mismatches.length === 0 ? digest : null };
}
