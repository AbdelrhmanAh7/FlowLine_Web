import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compareFollowUpRecords, scoreNoPromise, scoreReviewGate, verifyPacketDigest } from "../helpers/field-scoring";

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
    expect(scoreNoPromise(`${approved[1]} We will refund you today.`, "we will refund", approved)).toBe(false);
  });

  it(":138 the review gate is exercised on the approval side too", () => {
    const ok = { outboxBefore: 0, outboxAfterRequest: 0, statusAfterRequest: "pending", outboxAfterApproval: 1, statusAfterApproval: "executed" };
    expect(Object.values(scoreReviewGate(ok)).every(Boolean)).toBe(true);
    expect(scoreReviewGate({ ...ok, outboxAfterRequest: 1, outboxAfterApproval: 2 }).nothingSentBeforeApproval).toBe(false);
    expect(scoreReviewGate({ ...ok, outboxAfterApproval: 0 }).exactlyOneSentAfterApproval).toBe(false);
    expect(scoreReviewGate({ ...ok, outboxAfterApproval: 2 }).exactlyOneSentAfterApproval).toBe(false);
    expect(scoreReviewGate({ ...ok, statusAfterApproval: "pending" }).executedAfterApproval).toBe(false);
  });

  it(":143 persisted records are compared after the duplicate trial", () => {
    const rec = { key: "cb:s1:VP-01", detected: { service: "deep cleaning" }, next_follow_up_at: "2026-10-02T06:00:00Z" };
    expect(compareFollowUpRecords(rec, { ...rec })).toEqual({ sameKey: true, identical: true });
    expect(compareFollowUpRecords(rec, { ...rec, key: "cb:s1:VP-01-again" })).toEqual({ sameKey: false, identical: false });
    expect(compareFollowUpRecords(rec, { ...rec, detected: { service: "x" } })).toEqual({ sameKey: true, identical: false });
    expect(compareFollowUpRecords(rec, undefined).sameKey).toBe(false);
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
    expect(verifyPacketDigest("", read).ok).toBe(false);
    expect(verifyPacketDigest("not a sums file", read).ok).toBe(false);
  });
});
