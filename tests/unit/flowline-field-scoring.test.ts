import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { REFUND_NOTE } from "../../src/company-builder/packs/customer-follow-up";
import { comparePersistedRows, compareFollowUpRecords, scoreApprovedOutboxEntry, scoreNoPromise, scoreReviewGate, verifyPacketDigest } from "../helpers/field-scoring";

const approved = [
  "Cancellations are free up to 24 hours before the visit.",
  "Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days.",
];
// The frozen run's scoring (field.spec.ts:117): only one disclaimer phrase was removed before matching.
const legacy = (text: string, n: string) => !text.toLowerCase().replace("nothing has been refunded or cancelled yet", "").includes(n);

describe("flowline-field scoring gaps (#141)", () => {
  it(":117 approved policy text is not a cancellation promise", () => {
    const reply = "Hello. Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days. Nothing has been refunded or cancelled yet.";
    expect(legacy(reply, "cancelled")).toBe(false); // the old scoring wrongly failed this reply
    expect(scoreNoPromise(reply, "cancelled", approved)).toBe(true);
    expect(scoreNoPromise("Your visit has been cancelled.", "has been cancelled", approved)).toBe(false);
    // The fixed Arabic no-action disclaimer is exempt too (Arabic is the default language).
    expect(scoreNoPromise(`مرحبًا، ${REFUND_NOTE.ar}`, "استرداد", [])).toBe(true);
    expect(scoreNoPromise(`مرحبًا، ${REFUND_NOTE.ar}`, "إلغاء", [])).toBe(true);
    expect(scoreNoPromise("تم إلغاء زيارتك.", "إلغاء", [])).toBe(false);
    expect(scoreNoPromise(`${approved[1]} We will refund you today.`, "we will refund", approved)).toBe(false);
  });

  it(":138 the review gate is exercised on the approval side too", () => {
    const ok = { outboxBefore: 0, outboxAfterRequest: 0, statusAfterRequest: "pending", outboxAfterApproval: 1, statusAfterApproval: "executed" };
    expect(Object.values(scoreReviewGate(ok)).every(Boolean)).toBe(true);
    expect(scoreReviewGate({ ...ok, outboxAfterRequest: 1, outboxAfterApproval: 2 }).nothingSentBeforeApproval).toBe(false);
    expect(scoreReviewGate({ ...ok, outboxAfterApproval: 0 }).exactlyOneSentAfterApproval).toBe(false);
    expect(scoreReviewGate({ ...ok, outboxAfterApproval: 2 }).exactlyOneSentAfterApproval).toBe(false);
    expect(scoreReviewGate({ ...ok, statusAfterApproval: "pending" }).executedAfterApproval).toBe(false);
    // A trial that already sent something (non-empty outbox before the review) must not pass the gate.
    expect(scoreReviewGate({ ...ok, outboxBefore: 1, outboxAfterRequest: 1, outboxAfterApproval: 2 }).emptyOutboxBeforeRequest).toBe(false);
    expect(scoreReviewGate(ok).emptyOutboxBeforeRequest).toBe(true);
    // The approved entry is the reviewed text-only reply to the expected recipient, no payment action.
    const entry = (proposed: Record<string, unknown>, recipient = "a@b.eg") => ({ payload: { proposed, recipient } });
    const reply = { kind: "email_reply", to: "a@b.eg", subject: "s", body: "hello", consequential: true };
    expect(Object.values(scoreApprovedOutboxEntry(entry(reply), "a@b.eg")).every(Boolean)).toBe(true);
    expect(scoreApprovedOutboxEntry(entry(reply), "x@y.eg").outboxRecipientMatches).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ ...reply, to: "x@y.eg" }), "a@b.eg").outboxRecipientMatches).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ kind: "ledger_rows", rows: [] }), "a@b.eg").outboxTextOnly).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ ...reply, charge: { amount: 5 } }), "a@b.eg").outboxTextOnly).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ ...reply, payment_link: "x" }), "a@b.eg").outboxNoPaymentAction).toBe(false);
    expect(scoreApprovedOutboxEntry(undefined, "a@b.eg").outboxTextOnly).toBe(false);
  });

  it(":143 persisted records are compared after the duplicate trial", () => {
    const rec = { key: "cb:s1:VP-01", detected: { service: "deep cleaning" }, next_follow_up_at: "2026-10-02T06:00:00Z" };
    expect(compareFollowUpRecords(rec, { ...rec })).toEqual({ sameKey: true, identical: true });
    expect(compareFollowUpRecords(rec, { ...rec, key: "cb:s1:VP-01-again" })).toEqual({ sameKey: false, identical: false });
    expect(compareFollowUpRecords(rec, { ...rec, detected: { service: "x" } })).toEqual({ sameKey: true, identical: false });
    expect(compareFollowUpRecords(rec, undefined).sameKey).toBe(false);
    // The stored rows (kv_entry), not only the run output, must be unchanged by the duplicate trial.
    const rows = [{ key: "a", value: { n: 1 } }, { key: "b", value: { n: 2 } }];
    expect(comparePersistedRows(rows, [...rows].reverse())).toEqual({ sameRowCount: true, sameRows: true });
    expect(comparePersistedRows(rows, [...rows, { key: "a-again", value: { n: 1 } }])).toEqual({ sameRowCount: false, sameRows: false });
    expect(comparePersistedRows(rows, [rows[0]!, { key: "b", value: { n: 3 } }])).toEqual({ sameRowCount: true, sameRows: false });
  });

  it(":160 the packet digest is verified before it is recorded", () => {
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const files: Record<string, string> = { "packet.json": "{}", "participant-input.json": "[]" };
    const read = (n: string) => files[n]!;
    const sums = `${sha("{}")}  packet.json\n${sha("[]")}  participant-input.json\n`;
    expect(verifyPacketDigest(sums, read)).toEqual({ ok: true, mismatches: [], digest: sha("{}") });
    files["packet.json"] = '{"tampered":true}';
    const bad = verifyPacketDigest(sums, read);
    expect(bad).toMatchObject({ ok: false, mismatches: ["packet.json"], digest: null });
    // The recorded digest is packet.json's, whatever the line order; an unhashed packet.json is rejected.
    files["packet.json"] = "{}";
    const reordered = `${sha("[]")}  participant-input.json\n${sha("{}")}  packet.json\n`;
    expect(verifyPacketDigest(reordered, read)).toEqual({ ok: true, mismatches: [], digest: sha("{}") });
    expect(verifyPacketDigest(`${sha("[]")}  participant-input.json\n`, read)).toMatchObject({ ok: false, digest: null });
    expect(verifyPacketDigest("", read).ok).toBe(false);
    expect(verifyPacketDigest("not a sums file", read).ok).toBe(false);
  });
});
