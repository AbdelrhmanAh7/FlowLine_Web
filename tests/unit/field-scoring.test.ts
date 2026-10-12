import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOURS_LINE, isFriday, scoreClosedDay, scoreOwnerDecision } from "../helpers/fieldScoring";

const DIR = "artifacts/company-builder/validation/20261001-d224cfb/packet";
const v2 = JSON.parse(readFileSync(`${DIR}/packet.v2.json`, "utf8"));
const OWNER = v2.expected["VP-05"].mustQualifyOwnerDecision as string[];

const GENERIC = "Hello,\n\nA member of our team will review your request and confirm the next step. Nothing has been refunded or cancelled yet.";
const POLICY = "Refunds for cancelled paid visits are reviewed by the owner and confirmed within 3 working days.";

describe("field scoring: closedDay (VP-03, #142)", () => {
  const date = v2.expected["VP-03"].date as string;

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
  it("fails an Arabic confirmation of the date even with the hours line", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ متاح.`, date)).toBe(false);
    expect(scoreClosedDay(`${HOURS_LINE}\n\nيوم ٢٠٢٦-١٠-٠٩ متاح`, date)).toBe(false);
  });
  it("fails a dotted date confirmation (09.10.2026) next to the hours line", () => {
    expect(scoreClosedDay(`${HOURS_LINE}\n\nYour visit on 09.10.2026 is confirmed.`, date)).toBe(false);
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
    expect(scoreOwnerDecision(GENERIC, OWNER)).toBe(false);
  });
  it("passes 'the owner will decide' (any case) with no team decider", () => {
    expect(scoreOwnerDecision("Hello,\n\nThe Owner will decide on the refund.", OWNER)).toBe(true);
  });
  it("passes the quoted approved policy line when no team member is named as decider", () => {
    expect(scoreOwnerDecision(`Hello,\n\n${POLICY}\n\nNothing has been refunded or cancelled yet.`, OWNER)).toBe(true);
  });
  it("fails owner wording quoted from the policy when the next step names a team member (reviewer P1 shape)", () => {
    expect(scoreOwnerDecision(`${POLICY}\n\n${GENERIC}`, OWNER)).toBe(false);
    expect(scoreOwnerDecision(`${POLICY}\n\nA team member will review your refund request.`, OWNER)).toBe(false);
  });
});
