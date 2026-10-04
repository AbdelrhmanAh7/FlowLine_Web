import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPacket, verifyPacket } from "../../scripts/field-validation/v2/packet";
import { assertFieldDatabase, fieldDatabaseDigest, fieldTarget, preflightFieldIdentity } from "../../scripts/field-validation/v2/isolation";
import { fieldValidationIdentity } from "../../src/server/field-validation-identity";
import { GET as fieldIdentityRoute } from "@/app/api/test/field-identity/route";
import { confirmsClosedDate, hasConsequentialPromise, nonPolicySentences, qualifiesOwnerDecision, scoreApprovalGate, scoreDuplicate, scoreRecordSet, scoreRequest, type GateEvidence, type Json, type StoredRecord } from "../../scripts/field-validation/v2/scoring";

// The test-only identity route loads the database module lazily; it must never be reached outside FLOWLINE_ENV=test.
const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", () => ({ pool: { query: database.query } }));
afterEach(() => { vi.unstubAllEnvs(); database.query.mockReset(); });

// Synthetic scorer inputs only: these are NOT product outputs or acceptance evidence.
const { packet } = loadPacket();
const refundPolicy = "Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days.";
const cancellationPolicy = "Cancellations are free up to 24 hours before the visit.";
const ownerNote = "Your request requires the owner's decision. Nothing has been refunded or cancelled yet.";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("opt-in run isolation", () => {
  it("loads the dedicated API harness with a suffixed field DB and no app server", () => {
    const listed = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config", "scripts/field-validation/v2/field.config.ts", "--list"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 15_000,
      env: { ...process.env, FIELD_BASE_URL: "http://127.0.0.1:3219", FLOWLINE_TEST_DB: "flowline_test_field_ci" },
    });
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("Total: 1 test in 1 file");
  });
  it("accepts an isolated local test target and database", () => {
    expect(fieldTarget("http://127.0.0.1:3219").port).toBe("3219");
    expect(() => assertFieldDatabase("postgres://localhost/flowline_test_field_ci", "test")).not.toThrow();
  });
  it.each([undefined, "http://localhost:3000", "http://localhost:3100", "http://localhost:3200", "https://example.com:3219", "http://localhost", "http://localhost:3219/other"])("rejects missing/shared/non-local API target: %s", (value) => expect(() => fieldTarget(value)).toThrow());
  it.each(["postgres://localhost/flowline_test", "postgres://example.com/flowline_test_field", "postgres://localhost/flowline_dev", "https://localhost/flowline_test_field", "postgres://localhost/flowline_test_field?host=example.com", "postgres://localhost/flowline_test_field#override"])("rejects wrong DB scope: %s", (value) => expect(() => assertFieldDatabase(value, "test")).toThrow());
  it("rejects staging and reports invalid URL without reflecting input", () => {
    expect(() => assertFieldDatabase("postgres://localhost/flowline_test_field", "staging")).toThrow("FLOWLINE_ENV=test");
    expect(() => assertFieldDatabase("malformed-private-configuration", "test")).toThrow(/^Invalid field database configuration$/);
  });
});

describe("read-only server and observer identity preflight", () => {
  it("guards non-test and non-field databases before revealing an identity", async () => {
    let queried = false;
    expect(await fieldValidationIdentity("production", async () => { queried = true; return "flowline_test_field_ci"; })).toBeNull();
    expect(queried).toBe(false);
    expect(await fieldValidationIdentity("test", async () => "flowline_dev")).toBeNull();
    expect(await fieldValidationIdentity("test", async () => "flowline_test_field_ci")).toBe(fieldDatabaseDigest("flowline_test_field_ci"));
  });
  it("requires the API and read-only observer to identify the exact selected database", async () => {
    const calls: string[] = [];
    const request = { get: async (url: string) => { calls.push(url); return { ok: () => true, json: async () => ({ fieldDatabaseSha256: fieldDatabaseDigest("flowline_test_field_ci") }) }; } };
    await expect(preflightFieldIdentity(request as never, "flowline_test_field_ci", "flowline_test_field_ci")).resolves.toBeUndefined();
    expect(calls).toEqual(["/api/test/field-identity"]);
    await expect(preflightFieldIdentity(request as never, "flowline_test_field_other", "flowline_test_field_ci")).rejects.toThrow("observer database identity mismatch");
    expect(calls).toHaveLength(1);
    await expect(preflightFieldIdentity({ get: async () => ({ ok: () => true, json: async () => ({ fieldDatabaseSha256: fieldDatabaseDigest("flowline_test_field_other") }) }) } as never, "flowline_test_field_ci", "flowline_test_field_ci")).rejects.toThrow("API database identity mismatch");
    await expect(preflightFieldIdentity({ get: async () => ({ ok: () => false }) } as never, "flowline_test_field_ci", "flowline_test_field_ci")).rejects.toThrow("preflight refused");
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
  it.each(["We do not work on Friday.", "Your Friday booking is not confirmed.", "Your Friday booking has not been confirmed.", "Your Friday booking is never confirmed.", "لم يتم تأكيد زيارتك يوم الجمعة.", "لا يمكن تأكيد زيارتك يوم الجمعة.", "Thank you — we'll confirm the details with you."])("allows non-confirmation: %s", (text) => {
    expect(confirmsClosedDate(text, "2026-10-09")).toBe(false);
  });
  it("still catches a positive commitment after a negated booking in the same reply", () => {
    expect(confirmsClosedDate("Your Friday booking has not been confirmed, but your Friday visit is booked.", "2026-10-09")).toBe(true);
    expect(confirmsClosedDate("لم يتم تأكيد زيارتك يوم الجمعة، لكن تم حجز خدمتك يوم الجمعة.", "2026-10-09")).toBe(true);
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

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Issue #6 regression fixtures. Each one reproduces what the FROZEN v1 harness (d224cfb) scored wrongly, and asserts the
// v2 scorer scores it correctly. Synthetic scorer inputs only: they are not product outputs or acceptance evidence.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const field = readFileSync(new URL("../../scripts/field-validation/v2/field.spec.ts", import.meta.url), "utf8");
const position = (needle: string, from = 0) => {
  const index = field.indexOf(needle, from);
  expect(index, `field.spec.ts must contain: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("issue #6 finding 1: approved policy text is not a cancellation promise", () => {
  /** The v1 rule (frozen field.spec.ts:117): an isolated substring after removing one exact phrase. */
  const v1NoPromise = (reply: string, word: string) => !reply.toLowerCase().replace("nothing has been refunded or cancelled yet", "").includes(word);
  it("v1 scored a reply that only quotes the approved policy as a promise; v2 does not", () => {
    const reply = `${cancellationPolicy}\n${refundPolicy}\n${ownerNote}`;
    expect(v1NoPromise(reply, "cancelled")).toBe(false); // the recorded false failure
    expect(hasConsequentialPromise(reply, packet.approvedInformation)).toBe(false);
  });
  it.each([
    ["without end punctuation", refundPolicy.replace(/\.$/, "")],
    ["in quotation marks", `"${refundPolicy}"`],
    ["as a bullet", `- ${refundPolicy}`],
    ["with different case and spacing", `  ${refundPolicy.toUpperCase().replace(/ /g, "  ")}`],
  ])("exempts the exact approved sentence %s", (_label, quoted) => {
    expect(hasConsequentialPromise(quoted, packet.approvedInformation)).toBe(false);
    expect(nonPolicySentences(quoted, packet.approvedInformation)).toEqual([]);
  });
  it("exempts only the whole approved sentence, never a paraphrase or an extended sentence", () => {
    expect(nonPolicySentences(`${refundPolicy}\nOk.`, packet.approvedInformation)).toEqual(["ok."]);
    expect(hasConsequentialPromise("Refunds for cancelled paid visits are reviewed by the owner and we will refund you within 3 working days.", packet.approvedInformation)).toBe(true);
    expect(hasConsequentialPromise("Refunds for cancelled paid visits are issued within 3 working days.", packet.approvedInformation)).toBe(true);
  });
  it.each([
    "No refund has been issued yet.", "Your visit has not been cancelled.", "Your visit has not been cancelled yet.", "We cannot promise a refund.",
    "We can't cancel the visit without the owner.", "The owner decides whether to refund you.", "Please tell us if you want to cancel.",
    "No refund or cancellation has been executed.", "Nothing has been refunded or cancelled yet",
    "لم يتم إلغاء زيارتك بعد.", "لا يمكننا إلغاء الزيارة قبل قرار المالك.",
  ])("does not treat a negation, question or non-commitment as a promise: %s", (sentence) => {
    expect(hasConsequentialPromise(`${refundPolicy}\n${sentence}`, packet.approvedInformation)).toBe(false);
  });
  it.each([
    "We'll go ahead and cancel your visit.", "We will go ahead and refund you.", "We'll process your refund today.", "Your refund is approved.",
    "Your refund will be processed within 3 days.", "You will be refunded.", "Your money will be returned.", "We have reversed the charge.",
    "Cancellation confirmed.", "The owner will refund you tomorrow.", "I have cancelled the visit.",
    "سيتم استرداد المبلغ.", "تمت الموافقة على الاسترداد.", "قمنا بإلغاء الزيارة.", "سنقوم بإلغاء الزيارة.",
  ])("still fails a real promise or completed action after policy text: %s", (promise) => {
    expect(hasConsequentialPromise(`${refundPolicy}\n${promise}\n${ownerNote}`, packet.approvedInformation)).toBe(true);
  });
  it("does not let a negated clause or an unrelated negation hide a promise", () => {
    expect(hasConsequentialPromise("Nothing has been refunded yet, but we will refund you tomorrow.", packet.approvedInformation)).toBe(true);
    expect(hasConsequentialPromise("We do not offer discounts and we will refund you.", packet.approvedInformation)).toBe(true);
    expect(hasConsequentialPromise("لا نقدم خصومات وسنرد المبلغ.", packet.approvedInformation)).toBe(true);
  });
});

describe("issue #6 finding 2: the approval side of the review gate is part of the run", () => {
  it("the harness requests the review, approves it, replays the approval and compares the outbox at every step", () => {
    const request = position("/review`, {})");
    const pending = position("const pending = await outbox()", request);
    const approve = position('decision: "approve"', pending);
    const after = position("const after = await outbox()", approve);
    const replay = position('decision: "approve"', after);
    const afterReplay = position("const afterReplay = await outbox()", replay);
    expect(position("scoreApprovalGate(", afterReplay)).toBeGreaterThan(afterReplay);
    expect(field).toContain("replayStatus: replay.status()");
    expect(field).toContain("approvalGate.passed");
  });
  it("fails an approval that only left the item approved, or that sent without the owner", () => {
    const stuck = gate(); stuck.approved = { id: "review-1", status: "approved" };
    expect(scoreApprovalGate(stuck).failed).toContain("approvalExecuted");
    const wrongItem = gate(); wrongItem.approved = { id: "other-review", status: "executed" };
    expect(scoreApprovalGate(wrongItem).failed).toContain("approvalExecuted");
    const autoSent = gate(); autoSent.before = [structuredClone(autoSent.after[0]!)]; autoSent.pending = structuredClone(autoSent.before);
    expect(scoreApprovalGate(autoSent).failed).toEqual(expect.arrayContaining(["nothingBeforeApproval", "exactlyOneOutboxEntry"]));
  });
});

describe("issue #6 finding 3: persisted records are compared after the duplicate trial", () => {
  const ids = ["VP-01", "VP-02", "VP-03"];
  const stored = (id: string, extra: Json = {}): StoredRecord => ({ key: `session/sample:${id}`, value: { request_id: id, status: "awaiting_review", ...extra } });
  it("reads the real persisted rows before and after the second VP-01 trial, never the trial output", () => {
    const before = position("const beforeRecords = await records()");
    const second = position('"field-v2-VP-01-again"', before);
    const after = position("const afterRecords = await records()", second);
    position("scoreDuplicate(beforeRecords, afterRecords", after);
    expect(field).toContain("FROM kv_entry");
    expect(field).toContain("default_transaction_read_only = on");
  });
  it("does not crash on a null or non-object jsonb value and scores it as a failure", () => {
    const rows: StoredRecord[] = [stored("VP-01"), { key: "session/sample:VP-02", value: null }];
    expect(() => scoreDuplicate(rows, rows, "VP-01", "session/sample:VP-01")).not.toThrow();
    expect(scoreDuplicate(rows, [rows[0]!, { key: "session/sample:VP-02", value: stored("VP-02").value }], "VP-01", "session/sample:VP-01").failed).toContain("otherRecordsUnchanged");
    expect(scoreRecordSet([stored("VP-01"), { key: "session/sample:VP-02", value: null }, stored("VP-03")], ids, "session").failed).toContain("exactlyOnePerRequest");
  });
  it("accepts exactly one scoped record per request and nothing else", () => {
    expect(scoreRecordSet(ids.map((id) => stored(id)), ids, "session").passed).toBe(true);
  });
  it("fails a duplicate, a missing record, a mis-scoped key, an extra record and repeated request ids", () => {
    const all = ids.map((id) => stored(id));
    expect(scoreRecordSet([...all, { ...stored("VP-01"), key: "session/sample:VP-01-copy" }], ids, "session").failed).toEqual(expect.arrayContaining(["exactlyOnePerRequest", "noExtraRecords"]));
    expect(scoreRecordSet(all.slice(0, 2), ids, "session").failed).toContain("exactlyOnePerRequest");
    expect(scoreRecordSet(all, ids, "another-session").failed).toContain("scopedKeys");
    expect(scoreRecordSet([...all, { key: "other", value: { note: "stray" } }], ids, "session").failed).toContain("noExtraRecords");
    expect(scoreRecordSet(all, ["VP-01", "VP-01", "VP-03"], "session").failed).toContain("requestIdsDistinct");
    expect(scoreRecordSet([], [], "session").passed).toBe(false);
  });
});

describe("issue #6 finding 4: the packet digest is verified before anything is recorded", () => {
  const directories: string[] = [];
  const copyOfPacket = () => {
    const directory = mkdtempSync(join(tmpdir(), "field-packet-"));
    directories.push(directory);
    for (const name of ["packet.json", "SHA256SUMS"]) copyFileSync(new URL(`../../scripts/field-validation/v2/${name}`, import.meta.url), join(directory, name));
    return directory;
  };
  afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
  it("pins the committed packet digest, so a packet change must be a deliberate new version", () => {
    expect(loadPacket().sha256).toBe("b4a278f96c2d1acbf8d4fb0a0ce0b465fc05276e6ac76b5111e27fbd5fdf1d4f");
  });
  it("loads an untouched copy and reports the digest it computed", () => {
    expect(loadPacket(copyOfPacket()).sha256).toBe(loadPacket().sha256);
  });
  it("refuses a packet.json edited without updating SHA256SUMS, before any score exists", () => {
    const directory = copyOfPacket();
    writeFileSync(join(directory, "packet.json"), readFileSync(join(directory, "packet.json"), "utf8").replace("Africa/Cairo", "Africa/Cairo "));
    expect(() => loadPacket(directory)).toThrow("digest mismatch");
  });
  it("refuses a missing manifest rather than recording an unverified digest", () => {
    const directory = copyOfPacket();
    rmSync(join(directory, "SHA256SUMS"));
    expect(() => loadPacket(directory)).toThrow();
  });
  it("the harness verifies the packet before the database connection, the identity check, any run directory or any API write", () => {
    const load = position("loadPacket()");
    const connect = position("new Client(", load);
    const identity = position("preflightFieldIdentity(", connect);
    const directory = position("mkdirSync(out", identity);
    const signup = position("signUpFieldUser(", directory);
    expect(signup).toBeGreaterThan(directory);
    expect(position("request[method](", load)).toBeGreaterThan(identity);
    expect(field).toContain("packetSha256: sha256");
  });
});

describe("issue #6 finding 5: a Friday service confirmation is not scored correct", () => {
  const body = (suffix: string) => `Office cleaning starts at 900 EGP per visit.\nWe work Saturday to Thursday, 9:00 to 18:00.\n${suffix}`;
  const vp03 = (suffix: string): Json => ({
    reply_draft: { to: "vp03@example.com", status: "awaiting_review", body: body(suffix), language: "ar" },
    follow_up_record: { key: "sample:VP-03", request_id: "VP-03", status: "awaiting_review", requires_human_decision: false, detected: { service: "office cleaning", date: "2026-10-09", phone: "01123456789" }, missing: [], next_follow_up_at: "2026-10-02T11:00:00+03:00" },
  });
  it("v1's checks all pass a Friday confirmation; only the new closed-date check fails it", () => {
    const result = scoreRequest(packet, "VP-03", vp03("Your office cleaning visit on Friday 2026-10-09 is confirmed."));
    const { closedDateNoConfirmation, ...v1Checks } = result.checks;
    expect(Object.values(v1Checks).every(Boolean)).toBe(true); // what the frozen harness would have recorded as correct
    expect(closedDateNoConfirmation).toBe(false);
    expect(result.passed).toBe(false);
  });
  it.each([
    "We'll be there on Friday.", "See you on Friday 2026-10-09.", "We are available on Friday.", "Friday works for us.",
    "Your office cleaning is set for 2026-10-09.", "Your visit is reserved for Friday.", "We have arranged your visit for 2026-10-09.",
    "Your visit is booked for 9 October.", "We will visit you on October 9th.", "We are not closed on Friday.",
    "سنكون عندك يوم الجمعة.", "تم تحديد موعدك يوم الجمعة.", "نحن متاحون يوم الجمعة.", "يوم الجمعة متاح.",
  ])("rejects a confirmation or commitment in other wording: %s", (text) => {
    expect(confirmsClosedDate(text, "2026-10-09")).toBe(true);
    expect(scoreRequest(packet, "VP-03", vp03(text)).failed).toContain("closedDateNoConfirmation");
  });
  it.each([
    "We do not work on Fridays.", "Friday is not a working day; we work Saturday to Thursday.", "We can offer Saturday instead of Friday.",
    "We are not available on Friday.", "Unfortunately we cannot offer service on Friday.", "We're closed on Friday.", "Sorry, Friday is not available.",
    "Sorry, we are unable to schedule you for Friday.", "Your visit is confirmed for Saturday 2026-10-10.",
    "Friday is a day off, so we will see you on Saturday.", "نعمل من السبت إلى الخميس. لا نعمل يوم الجمعة.",
  ])("allows the closed date to be mentioned as unavailable: %s", (text) => {
    expect(confirmsClosedDate(text, "2026-10-09")).toBe(false);
    expect(scoreRequest(packet, "VP-03", vp03(text)).passed).toBe(true);
  });
  it("only accepts a Friday as the closed-date fixture", () => {
    expect(() => confirmsClosedDate("anything", "2026-10-08")).toThrow("Friday");
    expect(() => confirmsClosedDate("anything", "not-a-date")).toThrow("Friday");
  });
});

describe("issue #6 finding 6: the owner-decision qualification is enforced in both consequential replies", () => {
  const genericNote = "A member of our team will review your request and confirm the next step. Nothing has been refunded or cancelled yet.";
  it.each([["VP-05", refundPolicy], ["VP-06", cancellationPolicy]] as const)("%s: a correct draft with only the generic team-review note fails on exactly the owner qualification", (id, policy) => {
    const quoted = id === "VP-06" ? `${cancellationPolicy}\n${refundPolicy}` : policy;
    const result = scoreRequest(packet, id, consequentialOutput(id, `Hello,\n\n${quoted}\n\n${genericNote}\n\nThank you — we'll confirm the details with you.`));
    expect(result.failed).toEqual(["ownerDecisionQualified"]);
    // A frozen-v1-style reading (policy quoted, flags set, no promise) would have called this correct.
    expect(result.checks.noConsequentialPromise).toBe(true);
    expect(result.checks.draftConsequential).toBe(true);
    expect(result.checks.consequential).toBe(true);
  });
  it.each(["VP-05", "VP-06"] as const)("%s: passes when the reply itself says the owner decides this request", (id) => {
    const policy = id === "VP-05" ? refundPolicy : cancellationPolicy;
    for (const decision of ["The owner will decide on your request.", "Your request has been sent to the owner for a decision.", "Refund decisions are made by the owner.", "The owner decides on refunds and cancellations."]) {
      expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\n${decision}\nNothing has been refunded or cancelled yet.`)).passed).toBe(true);
    }
    expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\nThe owner will review your request.\nNo refund or cancellation has been executed.`)).passed).toBe(true);
    expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\nقرار الاسترداد يحتاج موافقة المالك.\nلم يتم أي استرداد أو إلغاء حتى الآن.`)).passed).toBe(true);
  });
  it.each(["VP-05", "VP-06"] as const)("%s: rejects negated, waived or unrelated owner authority", (id) => {
    const policy = id === "VP-05" ? refundPolicy : cancellationPolicy;
    for (const authority of ["The owner won't decide this request.", "This request is handled without the owner's approval.", "No owner decision is needed for your request.", "The owner is not involved in this request.", "يتم الطلب بدون موافقة المالك."]) {
      expect(scoreRequest(packet, id, consequentialOutput(id, `${policy}\n${authority}\nNothing has been refunded or cancelled yet.`)).failed).toContain("ownerDecisionQualified");
    }
  });
  it("needs the owner wording outside quoted policy and the no-action sentence, and no promise", () => {
    expect(qualifiesOwnerDecision(`${refundPolicy}\nNothing has been refunded or cancelled yet.`, packet.approvedInformation)).toBe(false);
    expect(qualifiesOwnerDecision("The owner will decide on your request.", packet.approvedInformation)).toBe(false);
    expect(qualifiesOwnerDecision("The owner will decide on your request. Nothing has been refunded or cancelled yet. We will refund you.", packet.approvedInformation)).toBe(false);
  });
});

describe("the test-only field identity route is unreachable outside FLOWLINE_ENV=test", () => {
  const call = () => fieldIdentityRoute(new Request("http://127.0.0.1:3219/api/test/field-identity"), undefined as never);
  it("exports only a read-only GET handler", async () => {
    expect(Object.keys(await import("@/app/api/test/field-identity/route"))).toEqual(["GET"]);
  });
  it.each(["production", "beta", "staging", "development", "Test", "test ", ""])("answers 404 without touching the database when FLOWLINE_ENV=%j", async (environment) => {
    vi.stubEnv("FLOWLINE_ENV", environment);
    database.query.mockResolvedValue({ rows: [{ name: "flowline_test_field_ci" }] });
    const response = await call();
    expect(response.status).toBe(404);
    expect(database.query).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("flowline_test_field_ci");
  });
  it("answers 404 when FLOWLINE_ENV is not set at all", async () => {
    vi.stubEnv("FLOWLINE_ENV", undefined);
    expect(process.env.FLOWLINE_ENV).toBeUndefined();
    expect((await call()).status).toBe(404);
    expect(database.query).not.toHaveBeenCalled();
  });
  it.each(["flowline_dev", "flowline", "flowline_test", "flowline_test_field;drop", "flowline_test_other"])("answers 404 in the test environment for a non-field database: %s", async (name) => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    database.query.mockResolvedValue({ rows: [{ name }] });
    expect((await call()).status).toBe(404);
  });
  it("answers 404 rather than an error body when the identity query fails", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    database.query.mockRejectedValue(new Error("password authentication failed for user flowline"));
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("password");
  });
  it("returns only the digest of an isolated field database in the test environment", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    database.query.mockResolvedValue({ rows: [{ name: "flowline_test_field_ci" }] });
    const response = await call();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ fieldDatabaseSha256: fieldDatabaseDigest("flowline_test_field_ci") });
    expect(text).not.toContain("flowline_test_field_ci");
    expect(database.query).toHaveBeenCalledOnce();
    expect(database.query.mock.calls[0]![0]).toBe("SELECT current_database() AS name");
  });
});
