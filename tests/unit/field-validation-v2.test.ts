import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPacket, verifyPacket } from "../../scripts/field-validation/v2/packet";
import { assertFieldDatabase, fieldTarget } from "../../scripts/field-validation/v2/isolation";
import { confirmsClosedDate, hasConsequentialPromise, qualifiesOwnerDecision, scoreApprovalGate, scoreDuplicate, scoreRequest, type GateEvidence, type Json, type StoredRecord } from "../../scripts/field-validation/v2/scoring";

// Synthetic scorer inputs only: these are NOT product outputs or acceptance evidence.
const { packet } = loadPacket();
const refundPolicy = "Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days.";
const cancellationPolicy = "Cancellations are free up to 24 hours before the visit.";
const ownerNote = "Your request requires the owner's decision. Nothing has been refunded or cancelled yet.";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("opt-in run isolation", () => {
  it("accepts an isolated local test target and database", () => {
    expect(fieldTarget("http://127.0.0.1:3219").port).toBe("3219");
    expect(() => assertFieldDatabase("postgres://localhost/flowline_test_field_ci", "test")).not.toThrow();
  });
  it.each([undefined, "http://localhost:3100", "https://example.com:3219", "http://localhost", "http://localhost:3219/other"])("rejects missing/shared/non-local API target: %s", (value) => expect(() => fieldTarget(value)).toThrow());
  it.each(["postgres://localhost/flowline_test", "postgres://example.com/flowline_test_field", "postgres://localhost/flowline_dev", "https://localhost/flowline_test_field"])("rejects wrong DB scope: %s", (value) => expect(() => assertFieldDatabase(value, "test")).toThrow());
  it("rejects staging and reports invalid URL without reflecting input", () => {
    expect(() => assertFieldDatabase("postgres://localhost/flowline_test_field", "staging")).toThrow("FLOWLINE_ENV=test");
    expect(() => assertFieldDatabase("malformed-private-configuration", "test")).toThrow(/^Invalid field database configuration$/);
  });
});

function consequentialOutput(id: "VP-05" | "VP-06", text: string): Json {
  return {
    reply_draft: { to: id === "VP-05" ? "vp05@example.com" : "vp06@example.com", status: "awaiting_review", body: text, consequential: "refund_or_cancellation" },
    follow_up_record: { key: `sample:${id}`, request_id: id, status: "awaiting_review", requires_human_decision: true, detected: { service: id === "VP-05" ? "deep cleaning" : "office cleaning", date: "2026-10-12" } },
  };
}

describe("packet integrity before scoring", () => {
  it("loads a distinct version with source commit/path/digest and the same ten request IDs", () => {
    const loaded = loadPacket();
    expect(loaded.packet.version).toBe("20261003-v2");
    expect(loaded.packet.provenance).toEqual({ sourceCommit: "719056cefa9d9810f93ea8c917da2bda82fe2e4a", sourcePath: "artifacts/company-builder/validation/20261001-d224cfb/packet/packet.json", sourceSha256: "4fa9841b2a5f40f76ea197e9a1a9f5dd4c10b3796e156968b4808f9d495d6596", issue: "https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/6" });
    expect(loaded.packet.requests.map((r) => r.id)).toEqual(["VP-01", "VP-02", "VP-03", "VP-04", "VP-05", "VP-06", "VP-07", "VP-08", "VP-09", "VP-10"]);
    expect(loaded.sha256).toBe(sha(readFileSync(new URL("../../scripts/field-validation/v2/packet.json", import.meta.url))));
  });
  it("rejects a changed payload even when JSON is valid", () => {
    const raw = Buffer.from(JSON.stringify(packet));
    const manifest = `${sha(raw)}  packet.json\n`;
    expect(verifyPacket(raw, manifest).packet.version).toBe("20261003-v2");
    expect(() => verifyPacket(Buffer.from(JSON.stringify({ ...packet, company: { ...packet.company, currency: "USD" } })), manifest)).toThrow("digest mismatch");
  });
  it.each(["", "xyz  packet.json\n", `${"0".repeat(64)}  other.json\n`, `${"0".repeat(64)}  packet.json\nextra`])("rejects malformed or wrong-file manifests: %s", (manifest) => {
    expect(() => verifyPacket(Buffer.from(JSON.stringify(packet)), manifest)).toThrow("digest manifest");
  });
  it("rejects a different version even with a matching digest", () => {
    const raw = Buffer.from(JSON.stringify({ ...packet, version: "v1" }));
    expect(() => verifyPacket(raw, `${sha(raw)}  packet.json\n`)).toThrow("Unsupported");
  });
});

describe("policy versus a consequential promise", () => {
  it("allows the approved cancelled-paid-visits policy for VP-06", () => {
    expect(hasConsequentialPromise(`${cancellationPolicy}\n${refundPolicy}\n${ownerNote}`, packet.approvedInformation)).toBe(false);
    expect(scoreRequest(packet, "VP-06", consequentialOutput("VP-06", `${cancellationPolicy}\n${refundPolicy}\n${ownerNote}`)).passed).toBe(true);
  });
  it.each(["Your visit has been cancelled.", "Your visit has been canceled.", "We will refund 1500 EGP.", "Your refund has been issued.", "You will receive your money.", "We will cancel your visit.", "تم إلغاء زيارتك.", "سنرد المبلغ."])("fails a real promise after policy text: %s", (promise) => {
    expect(hasConsequentialPromise(`${refundPolicy}\n${promise}\n${ownerNote}`, packet.approvedInformation)).toBe(true);
  });
  it("does not erase a promise appended to the policy or hidden after the no-action note", () => {
    expect(hasConsequentialPromise(`${refundPolicy} Your visit has been cancelled.`, packet.approvedInformation)).toBe(true);
    expect(hasConsequentialPromise("Nothing has been refunded or cancelled yet. We will refund you tomorrow.", packet.approvedInformation)).toBe(true);
  });
  it("does not trust reply metadata to excuse a promise", () => {
    const result = scoreRequest(packet, "VP-05", consequentialOutput("VP-05", `${refundPolicy}\n${ownerNote}\nWe will refund you.`));
    expect(result.failed).toContain("noConsequentialPromise");
    expect(result.failed).toContain("ownerDecisionQualified");
  });
});

describe("owner qualification for BOTH consequential cases", () => {
  it.each(["VP-05", "VP-06"] as const)("requires actual owner-decision and no-action wording: %s", (id) => {
    const policy = id === "VP-05" ? refundPolicy : cancellationPolicy;
    expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\n${ownerNote}`)).passed).toBe(true);
    expect(scoreRequest(packet, id, consequentialOutput(id, policy)).failed).toContain("ownerDecisionQualified");
    expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\nNothing has been refunded or cancelled yet.`)).failed).toContain("ownerDecisionQualified");
    expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\nA member of our team will review your request and confirm the next step. Nothing has been refunded or cancelled yet.`)).failed).toContain("ownerDecisionQualified");
  });
  it("requires draft and record flags in addition to owner wording", () => {
    const output = consequentialOutput("VP-06", `${cancellationPolicy}\n${ownerNote}`);
    (output.reply_draft as Json).consequential = null;
    (output.follow_up_record as Json).requires_human_decision = false;
    expect(scoreRequest(packet, "VP-06", output).failed).toEqual(expect.arrayContaining(["draftConsequential", "consequential"]));
  });
  it("accepts bounded Arabic owner wording and rejects negated authority", () => {
    expect(qualifiesOwnerDecision("قرار الاسترداد يحتاج موافقة المالك. لم يتم أي استرداد أو إلغاء حتى الآن.", packet.approvedInformation)).toBe(true);
    expect(qualifiesOwnerDecision("The owner will not decide this request. Nothing has been refunded or cancelled yet.", packet.approvedInformation)).toBe(false);
  });
  it.each(["VP-05", "VP-06"] as const)("does not count owner authority about an unrelated matter: %s", (id) => {
    const unrelated = "The owner will review the office inventory. Nothing has been refunded or cancelled yet.";
    const result = scoreRequest(packet, id, consequentialOutput(id, `${id === "VP-05" ? refundPolicy : cancellationPolicy}\n${unrelated}`));
    expect(result.failed).toContain("ownerDecisionQualified");
  });
});

describe("Friday availability", () => {
  const output = (suffix: string): Json => ({
    reply_draft: { to: "vp03@example.com", status: "awaiting_review", body: `Office cleaning starts at 900 EGP per visit.\nWe work Saturday to Thursday, 9:00 to 18:00.\n${suffix}`, language: "ar" },
    follow_up_record: { key: "sample:VP-03", request_id: "VP-03", status: "awaiting_review", requires_human_decision: false, detected: { service: "office cleaning", date: "2026-10-09", phone: "01123456789" }, missing: [], next_follow_up_at: "2026-10-02T11:00:00+03:00" },
  });
  it("keeps the correct requested date while refusing a Friday confirmation", () => {
    expect(scoreRequest(packet, "VP-03", output("We cannot confirm a visit on Friday 2026-10-09.")).passed).toBe(true);
    const result = scoreRequest(packet, "VP-03", output("Your Friday visit on 2026-10-09 is confirmed."));
    expect(result.checks.date).toBe(true);
    expect(result.failed).toContain("closedDateNoConfirmation");
  });
  it.each(["Your booking is confirmed.", "We will clean your office on 2026-10-09.", "We work on Friday.", "تم تأكيد زيارتك يوم الجمعة."])("rejects commitment: %s", (text) => {
    expect(confirmsClosedDate(text, "2026-10-09")).toBe(true);
  });
  it("does not let an unrelated negation conceal a Friday confirmation", () => {
    expect(confirmsClosedDate("We do not offer discounts, but your Friday visit is confirmed.", "2026-10-09")).toBe(true);
    expect(confirmsClosedDate("We do not offer discounts and your Friday visit is confirmed.", "2026-10-09")).toBe(true);
    expect(confirmsClosedDate("لا نقدم خصومات ولكن تم تأكيد زيارتك يوم الجمعة.", "2026-10-09")).toBe(true);
  });
  it.each(["We do not work on Friday.", "Your Friday booking is not confirmed.", "لا يمكن تأكيد زيارتك يوم الجمعة.", "Thank you — we'll confirm the details with you."])("allows non-confirmation: %s", (text) => {
    expect(confirmsClosedDate(text, "2026-10-09")).toBe(false);
  });
});

describe("persisted duplicate snapshots", () => {
  const rows: StoredRecord[] = [
    { key: "session/sample:VP-01", value: { request_id: "VP-01", customer: "vp01@example.com", status: "awaiting_review" } },
    { key: "session/sample:VP-02", value: { request_id: "VP-02", customer: "vp02@example.com" } },
  ];
  it("accepts equal persisted rows in a different query order", () => {
    expect(scoreDuplicate(rows, [...rows].reverse(), "VP-01", "session/sample:VP-01").passed).toBe(true);
  });
  it("rejects an extra stored record even when the result key is unchanged", () => {
    const result = scoreDuplicate(rows, [...rows, { key: "session/sample:VP-01-copy", value: rows[0]!.value }], "VP-01", "session/sample:VP-01");
    expect(result.failed).toEqual(expect.arrayContaining(["exactlyOneAfter", "countUnchanged", "keysUnchanged"]));
  });
  it("rejects same-count replacement, changed content, missing target and cross-record overwrite", () => {
    expect(scoreDuplicate(rows, [{ ...rows[0]!, key: "wrong-session/sample:VP-01" }, rows[1]!], "VP-01", rows[0]!.key).failed).toContain("stableScopedKey");
    expect(scoreDuplicate(rows, [{ ...rows[0]!, value: { ...rows[0]!.value, customer: "wrong@example.com" } }, rows[1]!], "VP-01", rows[0]!.key).failed).toContain("persistedValueUnchanged");
    expect(scoreDuplicate([], [], "VP-01", rows[0]!.key).passed).toBe(false);
    expect(scoreDuplicate(rows, [rows[0]!, { ...rows[1]!, value: { request_id: "VP-02", customer: "wrong@example.com" } }], "VP-01", rows[0]!.key).failed).toContain("otherRecordsUnchanged");
  });
});

function gate(): GateEvidence {
  const row = { id: "outbox-1", reviewItemId: "review-1", provenance: "mocked_integration", payload: { recipient: "vp05@example.com", proposed: { kind: "email_reply", to: "vp05@example.com", subject: "Re: Refund", body: `${refundPolicy}\n${ownerNote}`, consequential: "refund_or_cancellation" } } };
  return {
    before: [], pending: [], after: [row], afterReplay: [structuredClone(row)],
    review: { id: "review-1", status: "pending", kind: "send_sample", reviewerRole: "owner", connection: { provider: "sample_outbox", mocked: true }, proposed: row.payload.proposed },
    approved: { id: "review-1", status: "executed" }, replayStatus: 409, expectedRecipient: "vp05@example.com", expectedBody: row.payload.proposed.body,
  };
}
describe("approval gate checks both sides and binds exact sample text", () => {
  it("accepts exactly one approved sample reply, with replay refused", () => expect(scoreApprovalGate(gate()).passed).toBe(true));
  it("fails the v1 request-only gate without approval/send evidence", () => {
    const evidence = gate(); evidence.approved = {}; evidence.after = []; evidence.afterReplay = [];
    expect(scoreApprovalGate(evidence).failed).toEqual(expect.arrayContaining(["approvalExecuted", "exactlyOneOutboxEntry", "boundReview", "onlySampleText"]));
  });
  it("fails pre-approval sends, wrong recipient/body/binding, real provenance, refund actions and repeated sends", () => {
    const early = gate(); early.pending = structuredClone(early.after);
    expect(scoreApprovalGate(early).failed).toContain("nothingBeforeApproval");
    for (const mutation of [(e: GateEvidence) => { e.after[0]!.payload.recipient = "wrong@example.com"; }, (e: GateEvidence) => { (e.after[0]!.payload.proposed as Json).body = "altered"; }, (e: GateEvidence) => { e.after[0]!.provenance = "live"; }, (e: GateEvidence) => { (e.after[0]!.payload.proposed as Json).refund = 1500; }]) {
      const evidence = gate(); mutation(evidence);
      expect(scoreApprovalGate(evidence).failed).toContain("onlySampleText");
    }
    const binding = gate(); binding.after[0]!.reviewItemId = "other";
    expect(scoreApprovalGate(binding).failed).toContain("boundReview");
    const changedProposal = gate(); changedProposal.review.proposed = { ...(changedProposal.review.proposed as Json), body: "different pending text" };
    expect(scoreApprovalGate(changedProposal).failed).toContain("proposedTextBound");
    const duplicate = gate(); duplicate.afterReplay.push({ ...duplicate.after[0]!, id: "outbox-2" });
    expect(scoreApprovalGate(duplicate).failed).toContain("noDuplicateSend");
  });
  it("does not accept a member reviewer, unlabelled refund or a successful replay", () => {
    const evidence = gate(); evidence.review.reviewerRole = "editor"; evidence.review.proposed = {}; evidence.replayStatus = 200;
    expect(scoreApprovalGate(evidence).failed).toEqual(expect.arrayContaining(["ownerReview", "refundLabel", "replayRefused"]));
  });
});
