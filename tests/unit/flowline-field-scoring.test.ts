import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { customerFollowUpPack, REFUND_NOTE } from "../../src/company-builder/packs/customer-follow-up";
import { executeGraph } from "@/engine/execute";
import { FOLLOW_UP_FIXTURES, FOLLOW_UP_PARAMS } from "../fixtures/company-builder/customer-follow-up.fixtures";
import { memoryStore } from "../fixtures/company-builder/store-stub";
import { comparePersistedRows, compareFollowUpRecords, scoreApprovedAgainstPacket, scoreApprovedOutboxEntry, scoreNoPromise, scoreReviewGate, verifyPacketDigest } from "../helpers/field-scoring";

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
    // Finding 3 (issue #226): an empty approvedInformation entry alone must not allow a forbidden promise to pass scoring
    expect(scoreNoPromise("We will refund you today.", "we will refund", [""])).toBe(false);
    expect(scoreNoPromise("We will refund you today.", "we will refund", ["  ", ""])).toBe(false);
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
    expect(Object.values(scoreApprovedOutboxEntry(entry(reply), "a@b.eg", reply)).every(Boolean)).toBe(true);
    expect(scoreApprovedOutboxEntry(entry(reply), "x@y.eg", reply).outboxRecipientMatches).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ ...reply, to: "x@y.eg" }), "a@b.eg", reply).outboxRecipientMatches).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ kind: "ledger_rows", rows: [] }), "a@b.eg", reply).outboxTextOnly).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ ...reply, charge: { amount: 5 } }), "a@b.eg", reply).outboxTextOnly).toBe(false);
    expect(scoreApprovedOutboxEntry(entry({ ...reply, payment_link: "x" }), "a@b.eg", reply).outboxNoPaymentAction).toBe(false);
    expect(scoreApprovedOutboxEntry(undefined, "a@b.eg", reply).outboxTextOnly).toBe(false);
  });

  it(":138 the approved entry meets the packet's VP-05 expectation (body, promise, consequential, payment)", () => {
    const expected = { recipient: "a@b.eg", consequential: true, noPaymentAction: true, mustQuoteOneOf: [approved[1]], mustNotPromise: ["we will refund"] };
    const ok = { kind: "email_reply", to: "a@b.eg", subject: "s", body: `Hello. ${approved[1]}`, consequential: "refund_or_cancellation" };
    const at = (proposed: Record<string, unknown>) => ({ payload: { recipient: "a@b.eg", proposed } });
    expect(Object.values(scoreApprovedAgainstPacket(at(ok), expected, approved)).every(Boolean)).toBe(true);
    expect(scoreApprovedAgainstPacket(at({ ...ok, body: "Hello." }), expected, approved).outboxQuotesApprovedText).toBe(false);
    expect(scoreApprovedAgainstPacket(at({ ...ok, body: `${ok.body} We will refund you today.` }), expected, approved).outboxNoPromise).toBe(false);
    expect(scoreApprovedAgainstPacket(at({ ...ok, consequential: null }), expected, approved).outboxConsequentialMatches).toBe(false);
    expect(scoreApprovedAgainstPacket(at({ ...ok, payment_link: "x" }), expected, approved).outboxNoPaymentActionPacket).toBe(false);
    expect(scoreApprovedAgainstPacket(at({ ...ok, payment_link: "x" }), { ...expected, noPaymentAction: false }, approved).outboxNoPaymentActionPacket).toBe(true);
  });

  it(":143 persisted records are compared after the duplicate trial", () => {
    const rec = { key: "cb:s1:VP-01", detected: { service: "deep cleaning" }, next_follow_up_at: "2026-10-02T06:00:00Z" };
    expect(compareFollowUpRecords(rec, { ...rec })).toEqual({ sameKey: true, identical: true });
    expect(compareFollowUpRecords(rec, { ...rec, key: "cb:s1:VP-01-again" })).toEqual({ sameKey: false, identical: false });
    expect(compareFollowUpRecords(rec, { ...rec, detected: { service: "x" } })).toEqual({ sameKey: true, identical: false });
    expect(compareFollowUpRecords(rec, undefined).sameKey).toBe(false);
    // The stored rows (kv_entry), not only the run output, must be unchanged by the duplicate trial.
    const rows = [{ key: "a", value: { n: 1 } }, { key: "b", value: { n: 2 } }];
    expect(comparePersistedRows(rows, [...rows].reverse(), rows[0]!)).toMatchObject({ sameRowCount: true, sameRows: true });
    expect(comparePersistedRows(rows, [...rows, { key: "a-again", value: { n: 1 } }], rows[0]!)).toMatchObject({ sameRowCount: false, sameRows: false });
    expect(comparePersistedRows(rows, [rows[0]!, { key: "b", value: { n: 3 } }], rows[0]!)).toMatchObject({ sameRowCount: true, sameRows: false });
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

  it("approval preserves the exact reviewed draft, including subject and consequential flag", () => {
    const proposed = { kind: "email_reply", to: "a@b.eg", subject: "Re: refund", body: "Owner will review.", consequential: true };
    const score = (actual: unknown) => scoreApprovedOutboxEntry({ payload: { recipient: proposed.to, proposed: actual } }, proposed.to, proposed);
    expect(score({ ...proposed }).outboxMatchesReviewedDraft).toBe(true);
    for (const changed of [{ body: "Refund completed." }, { subject: "Invoice" }, { consequential: false }]) {
      expect(score({ ...proposed, ...changed }).outboxMatchesReviewedDraft).toBe(false);
    }
    expect(score(undefined).outboxMatchesReviewedDraft).toBe(false);
  });

  it("duplicate scoring requires one persisted copy of the original follow-up in each snapshot", () => {
    const record = { key: "sample:VP-01", store_key: "installation/sample:VP-01", request_id: "VP-01" };
    const stored = { key: record.store_key, value: record };
    const score = (before: typeof stored[], after: typeof stored[]) => comparePersistedRows(before, after, stored);
    expect(score([stored], [stored]).exactlyOneFollowUp).toBe(true);
    expect(score([stored], [{ ...stored, value: { request_id: "VP-01", store_key: record.store_key, key: record.key } }]).sameRows).toBe(true);
    expect(score([], []).exactlyOneFollowUp).toBe(false);
    expect(score([stored], []).exactlyOneFollowUp).toBe(false);
    expect(score([stored, stored], [stored, stored]).exactlyOneFollowUp).toBe(false);
    const wrong = { ...stored, value: { ...record, request_id: "other" } };
    expect(score([wrong], [wrong]).exactlyOneFollowUp).toBe(false);
  });

  it("the real pack persists the follow-up under its store_key, so comparePersistedRows reads the record it compares", async () => {
    // Confirms (against the pack, not a fixture) the two assumptions the duplicate check in field.spec.ts relies on:
    // follow_up_record carries store_key, and the persisted kv_entry value is that whole record.
    const params = { ...FOLLOW_UP_PARAMS, services: [...FOLLOW_UP_PARAMS.services], requiredDetails: [...FOLLOW_UP_PARAMS.requiredDetails], language: "en" };
    const graph = customerFollowUpPack.compile(params, (id) => id);
    const store = memoryStore();
    const run = await executeGraph(graph, FOLLOW_UP_FIXTURES[0]!.input, { handler: store.handler });
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    const record = (run.output as Record<string, Record<string, unknown>>).follow_up_record!;
    expect(typeof record.store_key).toBe("string");
    const rows = [...store.entries]
      .filter(([k]) => k.startsWith("cb_customer_follow_ups/"))
      .map(([k, value]) => ({ key: k.slice("cb_customer_follow_ups/".length), value }));
    expect(rows).toEqual([{ key: record.store_key, value: record }]);
    const expected = { key: record.store_key, value: record };
    expect(comparePersistedRows(rows, rows, expected)).toEqual({ sameRowCount: true, sameRows: true, exactlyOneFollowUp: true });
    // The regression the reviewer described — a second stored row with the same follow_up_record — is caught by the row checks.
    const second = { key: `${String(record.store_key)}-again`, value: record };
    expect(comparePersistedRows(rows, [...rows, second], expected)).toMatchObject({ sameRowCount: false, sameRows: false });
  });
});
