import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOURS_LINE, escapeRegExp, isFriday, scoreClosedDay, scoreOwnerDecision } from "../helpers/fieldScoring";

const DIR = "artifacts/company-builder/validation/20261001-d224cfb/packet";
const v2 = JSON.parse(readFileSync(`${DIR}/packet.v2.json`, "utf8"));
const OWNER = v2.expected["VP-05"].mustQualifyOwnerDecision as string[];
const date = v2.expected["VP-03"].date as string;

const GENERIC = "Hello,\n\nA member of our team will review your request and confirm the next step. Nothing has been refunded or cancelled yet.";
const POLICY = "Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days.";

describe("field scoring: closedDay (VP-03, #142)", () => {

  it("packet v2 asks for the check on a Friday date", () => {
    expect(v2.expected["VP-03"].closedDay).toBe(true);
    expect(date).toBe("2026-10-09");
    expect(isFriday(date)).toBe(true);
    expect(isFriday("2026-10-08")).toBe(false); // Thursday
  });
  it("the hours sentence matches the approved line of the packet", () => {
    expect(v2.approvedInformation).toContain(HOURS_LINE);
  });
  it("passes a reply that quotes the working-hours line", () => {
    expect(scoreClosedDay(`مرحبًا،\n\n${HOURS_LINE}\n\nشكرًا لك، وسنؤكد التفاصيل معك.`, date)).toBe(true);
  });
  it("fails a Friday confirmation without the working-hours line (run 4 VP-03 reply)", () => {
    expect(scoreClosedDay("مرحبًا،\n\nOffice cleaning starts at 900 EGP per visit.\n\nشكرًا لك، وسنؤكد التفاصيل معك.", date)).toBe(false);
  });
  it("fails a minimal confirmation (run 5 VP-03 reply)", () => {
    expect(scoreClosedDay("مرحبًا،\n\nشكرًا لك، وسنؤكد التفاصيل معك.", date)).toBe(false);
  });
  it("fails a reply that quotes the hours but still confirms the Friday date", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026-10-09 is confirmed.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nWe booked you for Friday.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nتم تأكيد موعدكم يوم الجمعة ٢٠٢٦-١٠-٠٩.`, date)).toBe(false);
  });
  it("fails a contradictory sentence: general 'closed' but specific date confirmed", () => {
    expect(scoreClosedDay(`We are closed on Fridays but your visit on 2026-10-09 is confirmed. ${HOURS_LINE}`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE} We are closed on Fridays but we confirm 2026-10-09 for you.`, date)).toBe(false);
  });
  it("fails a reply that quotes the hours but says 2026-10-09 is bookable (reviewer P1 shape)", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYes, 2026-10-09 is bookable for you.`, date)).toBe(false);
  });
  it("passes the ideal reply: closed on Fridays plus the product's generic closing (no false positive)", () => {
    expect(scoreClosedDay(`We are closed on Fridays. ${HOURS_LINE}\n\nThank you — we'll confirm the details with you.`, date)).toBe(true);
    expect(scoreClosedDay(`Friday 2026-10-09 is not available. ${HOURS_LINE}\n\nThank you — we'll confirm the details with you.`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nنحن مغلقون يوم الجمعة.\n\nشكرًا لك، وسنؤكد التفاصيل معك.`, date)).toBe(true);
  });
  it("passes an Arabic negated-date sentence plus the hours line (trailing \\b never matched Arabic)", () => {
    expect(scoreClosedDay(`يوم ٢٠٢٦-١٠-٠٩ غير متاح.\n\n${HOURS_LINE}`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ غير متاح`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ لا مؤكد، نأسف.`, date)).toBe(true);
  });
  it("passes inflected Arabic negation forms (feminine متاحة and tanwin/diacritics, tatweel ـة, plural ون/ين/ات)", () => {
    expect(scoreClosedDay(`الخدمة في يوم ٢٠٢٦-١٠-٠٩ غير متاحة.\n\n${HOURS_LINE}`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ غير متاحٍ`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ غير متاحـة`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالموظفون ليوم ٢٠٢٦-١٠-٠٩ غير متاحين.`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالموظفون ليوم ٢٠٢٦-١٠-٠٩ غير متاحون.`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالخدمات ليوم ٢٠٢٦-١٠-٠٩ غير متاحات.`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالمواعيد ليوم ٢٠٢٦-١٠-٠٩ لا مؤكدة.`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالمواعيد ليوم ٢٠٢٦-١٠-٠٩ غير مُتَاحَة.`, date)).toBe(true);
  });
  it("fails an Arabic confirmation of the date with an inflected form not preceded by negation, or with diacritics", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ متاح.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ متاح`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالخدمة في يوم ٢٠٢٦-١٠-٠٩ متاحة.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالخدمة في يوم ٢٠٢٦-١٠-٠٩ متاحـة.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالموظفون في يوم ٢٠٢٦-١٠-٠٩ متاحون.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nالموظفون في يوم ٢٠٢٦-١٠-٠٩ متاحين.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ مُتاح.`, date)).toBe(false);
  });
  it("fails confirmations worded outside the basic list, and a confirmation next to an unrelated negation", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit is set for 2026-10-09.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nSee you on 2026-10-09.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026-10-09 is confirmed, while later appointments are not available.`, date)).toBe(false);
  });
  it("fails a dotted date confirmation (09.10.2026 or 2026.10.09) next to the hours line", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 09.10.2026 is confirmed.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026.10.09 is confirmed.`, date)).toBe(false);
  });
  it("date fragment containing '.' does not match an arbitrary character (escapeRegExp, 2026-10-09 vs 2026x10x09)", () => {
    expect(escapeRegExp("2026.10.09")).toBe("2026\\.10\\.09");
    expect(new RegExp(escapeRegExp("2026.10.09")).test("2026x10x09")).toBe(false);
    expect(new RegExp("2026.10.09").test("2026x10x09")).toBe(true);
    expect(isFriday("2026.10.09")).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026.10.09 is confirmed.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026x10x09 is confirmed.`, date)).toBe(true);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026.10.09 is confirmed.`, "2026.10.09")).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 2026x10x09 is confirmed.`, "2026.10.09")).toBe(true);
  });
  it("fails when the requested date is not a Friday (the check does not apply)", () => {
    expect(scoreClosedDay(HOURS_LINE, "2026-10-08")).toBe(false);
  });
});

describe("field scoring: ownerDecision (VP-05/VP-06, #142)", () => {
  it("packet v2 asks for the check on VP-05 and VP-06 only", () => {
    expect(OWNER).toEqual(["reviewed by the owner", "the owner will decide"]);
    expect(v2.expected["VP-06"].mustQualifyOwnerDecision).toEqual(OWNER);
    expect(v2.expected["VP-01"].mustQualifyOwnerDecision).toBeUndefined();
  });
  it("fails a reply with only the generic team note", () => {
    expect(scoreOwnerDecision(GENERIC, OWNER, [POLICY])).toBe(false);
  });
  it("passes 'the owner will decide' (any case) with no team decider", () => {
    expect(scoreOwnerDecision("Hello,\n\nThe Owner will decide on the refund.", OWNER, [POLICY])).toBe(true);
  });
  it("fails when the owner wording exists only inside the quoted approved policy (reviewer P1 shape)", () => {
    expect(scoreOwnerDecision(`Hello,\n\n${POLICY}\n\nNothing has been refunded or cancelled yet.`, OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision(`${POLICY}\n\n${GENERIC}`, OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision(`${POLICY}\n\nA team member will review your refund request.`, OWNER, [POLICY])).toBe(false);
  });
  it("fails a policy quote followed by a non-team decider that never mentions the owner", () => {
    expect(scoreOwnerDecision(`${POLICY}\n\nA colleague will decide your refund.`, OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision(`${POLICY}\n\nOur staff will decide on the refund.`, OWNER, [POLICY])).toBe(false);
  });
  it("passes a policy quote when the reply itself says the owner decides", () => {
    expect(scoreOwnerDecision(`${POLICY}\n\nThe owner will decide on your refund.`, OWNER, [POLICY])).toBe(true);
  });
  it("does not misread a team member who only relays the owner's decision (reviewer P1 shape)", () => {
    expect(scoreOwnerDecision("The owner will decide on the refund; a member of our team will contact you with that decision.", OWNER, [POLICY])).toBe(true);
    expect(scoreOwnerDecision("The owner will decide. Our team will get back to you by phone.", OWNER, [POLICY])).toBe(true);
  });
  it("fails a non-owner decider even when the owner is named elsewhere or the policy line is quoted", () => {
    expect(scoreOwnerDecision(`${POLICY}\n\nThe billing manager will decide on your refund.`, OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision("The owner will decide in general, but the billing manager will decide this refund.", OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision("The owner will decide. Your request is reviewed by the support team.", OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision("The owner will decide. Our staff can approve it today.", OWNER, [POLICY])).toBe(false);
  });
  it("VP-06 shape: the refund-policy line is not in mustQuote, but stripping every approved line still rejects it", () => {
    const vp06 = v2.expected["VP-06"];
    expect(vp06.mustQuote).not.toContain(POLICY);
    expect(scoreOwnerDecision(`${POLICY}\n\nNothing has been refunded or cancelled yet.`, OWNER, v2.approvedInformation)).toBe(false);
    expect(scoreOwnerDecision(`${POLICY}\n\nNothing has been refunded or cancelled yet.`, OWNER, vp06.mustQuote)).toBe(true); // the old strip list: the loophole
  });
  it("passes the product's explicit owner-decision sentence (run 6 VP-05/VP-06 reply), not only the packet's literal phrases", () => {
    const run6 = `Hello,\n\nCancellations are free up to 24 hours before the visit.\n\n${POLICY}\n\nThe business owner decides this refund or cancellation request. Nothing has been refunded or cancelled.\n\nThank you — we'll confirm the details with you.`;
    expect(scoreOwnerDecision(run6, OWNER, v2.approvedInformation)).toBe(true);
    expect(scoreOwnerDecision("Your refund will be decided by the owner.", OWNER, [POLICY])).toBe(true);
    expect(scoreOwnerDecision("The owner decides. Our staff will decide this refund today.", OWNER, [POLICY])).toBe(false);
    expect(scoreOwnerDecision("The owner is on holiday; we will reply soon.", OWNER, [POLICY])).toBe(false);
  });
  it("re-scores the committed run-4 replies under the current scorer (not a new run)", () => {
    const run4 = JSON.parse(readFileSync("artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run4-r4-f74285c/results.json", "utf8"));
    const body = (id: string) => (run4.results.find((r: { id: string }) => r.id === id).reply.body as string);
    const approved = () => v2.approvedInformation as string[]; // what field.spec.ts strips (every approved line)
    expect(scoreClosedDay(body("VP-03"), v2.expected["VP-03"].date)).toBe(false);
    expect(scoreOwnerDecision(body("VP-05"), OWNER, approved())).toBe(false);
    expect(scoreOwnerDecision(body("VP-06"), OWNER, approved())).toBe(false);
  });
  it("re-scores the run-8 VP-03, VP-05 and VP-06 reply texts verbatim under the fixed scorer", () => {
    const vp03Reply = "مرحبًا،\n\nOffice cleaning starts at 900 EGP per visit.\n\nشكرًا لك، وسنؤكد التفاصيل معك.";
    const vp05Reply = `Hello,\n\n${POLICY}\n\nThe business owner decides this refund or cancellation request. Nothing has been refunded or cancelled.\n\nThank you — we'll confirm the details with you.`;
    const vp06Reply = `Hello,\n\nCancellations are free up to 24 hours before the visit.\n\n${POLICY}\n\nThe business owner decides this refund or cancellation request. Nothing has been refunded or cancelled.\n\nThank you — we'll confirm the details with you.`;

    expect(scoreClosedDay(vp03Reply, date)).toBe(false);
    expect(scoreOwnerDecision(vp05Reply, OWNER, v2.approvedInformation)).toBe(true);
    expect(scoreOwnerDecision(vp06Reply, OWNER, v2.approvedInformation)).toBe(true);
  });
});
