import { isDeepStrictEqual } from "node:util";
import type { Packet } from "./packet";

export type Json = Record<string, unknown>;
export interface Score { passed: boolean; checks: Record<string, boolean>; failed: string[] }
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const score = (checks: Record<string, boolean>): Score => ({ checks, passed: Object.values(checks).every(Boolean), failed: Object.keys(checks).filter((key) => !checks[key]) });
const normalized = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const sentences = (text: string) => text.split(/\n+|(?<=[.!?؟])\s+/).map(normalized).filter(Boolean);

/** Remove only complete, exact approved statements. A promise appended to a policy is still examined. */
export function nonPolicySentences(text: string, approved: string[]) {
  const policies = new Set(approved.map(normalized));
  return sentences(text).filter((sentence) => !policies.has(sentence));
}

const NO_ACTION = new Set([
  "nothing has been refunded or cancelled yet.",
  "nothing has been refunded or canceled yet.",
  "no refund or cancellation has been executed.",
  "لم يتم أي استرداد أو إلغاء حتى الآن.",
]);

/** Bounded EN/AR packet grammar; not a general natural-language or provider evaluator. */
export function hasConsequentialPromise(text: string, approved: string[]) {
  return nonPolicySentences(text, approved).filter((line) => !NO_ACTION.has(line)).some((line) =>
    /\b(?:we will refund|we'll refund|refund has been issued|refunded|you will receive your money|cancelled|canceled|we will cancel|we'll cancel|cancellation (?:is|has been) (?:confirmed|completed))\b/.test(line)
    || /(?:تم (?:الاسترداد|استرداد|إلغاء)|سنرد|سنسترد|سنلغي|سنعيد.*(?:المبلغ|أموالك)|أُلغي)/u.test(line));
}

export function qualifiesOwnerDecision(text: string, approved: string[]) {
  const lines = nonPolicySentences(text, approved);
  const authority = lines.some((line) =>
    !/\b(?:not|without|no)\b|(?:لا |لن |دون )/u.test(line) && (
      /\bowner(?:'s)?\b.*\b(?:decid\w*|decision|review\w*|approv\w*)\b/.test(line)
      || /\b(?:requires?|await\w*|pending|subject to)\b.*\bowner(?:'s)?\b.*\b(?:decision|review|approval)\b/.test(line)
      || /(?:المالك|صاحب العمل).*(?:يقرر|يراجع|قرار|موافقة)|(?:قرار|مراجعة|موافقة).*(?:المالك|صاحب العمل)/u.test(line)
    ) && /\b(?:request|refund|cancell?ation|cancel|visit|booking)\b|(?:طلب|استرداد|إلغاء|زيارة|حجز)/u.test(line));
  return authority && lines.some((line) => NO_ACTION.has(line)) && !hasConsequentialPromise(text, approved);
}

/** A positive Friday commitment fails even when the reply also quotes the correct opening hours. */
export function confirmsClosedDate(text: string, date: string) {
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) throw new Error("Closed-date fixture must be a Friday");
  return sentences(text).flatMap((line) => line.split(/\b(?:but|however)\b|;|(?:ولكن|لكن)/u)).some((clause) => {
    // Remove only a negated commitment, not a whole sentence containing an unrelated "not".
    const line = clause
      .replace(/\b(?:cannot|can't|unable to|do not|don't|will not|won't)\s+(?:confirm|book|schedule|clean|work|open)(?:\s+\w+){0,2}/g, "")
      .replace(/\bnot\s+(?:confirmed|booked|scheduled|available|open)\b/g, "")
      .replace(/(?:لا يمكن|يتعذر)\s+(?:تأكيد|حجز)|(?:لن|لا)\s+(?:نعمل|نؤكد|نقوم)|غير\s+(?:متاح|مؤكد)/gu, "");
    return /\b(?:booking|visit|cleaning|service|appointment|date)\b.*\b(?:confirmed|booked|scheduled)\b|\b(?:confirmed|booked|scheduled)\b.*\b(?:booking|visit|cleaning|service|appointment|date)\b/.test(line)
      || /(?:تم تأكيد|تم حجز).*(?:زيارتك|حجزك|خدمة|تنظيف)/u.test(line)
      || ((line.includes(date) || /\bfriday\b|الجمعة/u.test(line)) && /\b(?:will|can|available|confirm|book|schedule|work|open)\b|(?:سنقوم|سنؤكد|سنعمل|متاح|مؤكد|تم تأكيد|تم حجز)/u.test(line));
  });
}

export function scoreRequest(packet: Packet, id: string, output: Json): Score {
  const expected = object(packet.expected[id as keyof Packet["expected"]]);
  if (!Object.keys(expected).length) throw new Error("Unknown field request");
  const reply = object(output.reply_draft), person = object(output.needs_person), record = object(output.follow_up_record), detected = object(record.detected);
  const hasReply = Object.keys(reply).length > 0, hasPerson = Object.keys(person).length > 0;
  const text = typeof reply.body === "string" ? reply.body : "";
  const checks: Record<string, boolean> = {};
  if (expected.outcome === "hand_off_to_person") {
    checks.outcome = hasPerson && !hasReply;
    const reasons: Record<string, string> = { complaint: "complaint_needs_person", no_approved_information: "no_approved_information", empty_request: "empty_request" };
    checks.reason = person.reason === reasons[String(expected.reason)];
  } else {
    checks.outcome = hasReply && !hasPerson && text.length > 0;
    checks.recipient = reply.to === expected.recipient;
    checks.reviewRequired = reply.status === "awaiting_review";
    if ("service" in expected) {
      const index = packet.company.services.indexOf(String(expected.service));
      checks.service = detected.service === expected.service || (index >= 0 && detected.service === packet.company.servicesArabic[index]);
    }
    for (const key of ["date", "phone"]) if (key in expected) checks[key] = detected[key] === expected[key];
    if (expected.phoneDisplay) checks.phoneDisplay = record.phone_display === expected.phoneDisplay;
    if (expected.missing && !expected.missingAllowed) checks.missing = isDeepStrictEqual(record.missing, expected.missing);
    for (const quote of expected.mustQuote as string[] ?? []) checks[`quote:${quote}`] = text.includes(quote);
    if (expected.mustQuoteOneOf) checks.quotesPolicy = (expected.mustQuoteOneOf as string[]).some((line) => text.includes(line));
    for (const forbidden of expected.mustNotContain as string[] ?? []) checks[`noInvented:${forbidden}`] = !normalized(text).includes(normalized(forbidden));
    if (expected.mustNotPromise) checks.noConsequentialPromise = !hasConsequentialPromise(text, packet.approvedInformation);
    if (expected.followUpAt) checks.followUp = Date.parse(String(record.next_follow_up_at)) === Date.parse(String(expected.followUpAt));
    if (expected.suspiciousFlagged) checks.suspiciousFlagged = reply.suspicious === true;
    if (expected.language) checks.language = reply.language === expected.language;
    if (expected.ownerDecisionRequired) {
      checks.ownerDecisionQualified = qualifiesOwnerDecision(text, packet.approvedInformation);
      checks.draftConsequential = reply.consequential === "refund_or_cancellation";
    }
    if (expected.closedDate) checks.closedDateNoConfirmation = !confirmsClosedDate(text, String(expected.closedDate));
  }
  checks.consequential = record.requires_human_decision === Boolean(expected.consequential);
  checks.recordExists = typeof record.key === "string" && record.key.length > 0 && record.request_id === id;
  checks.recordStatus = record.status === (hasReply ? "awaiting_review" : "needs_person");
  return score(checks);
}

export interface StoredRecord { key: string; value: Json }
export function scoreDuplicate(before: StoredRecord[], after: StoredRecord[], requestId: string, expectedStoreKey: string): Score {
  const first = before.filter((row) => row.value.request_id === requestId), second = after.filter((row) => row.value.request_id === requestId);
  const sortedKeys = (rows: StoredRecord[]) => rows.map((row) => row.key).sort();
  return score({
    exactlyOneBefore: first.length === 1,
    exactlyOneAfter: second.length === 1,
    countUnchanged: before.length === after.length,
    keysUnchanged: isDeepStrictEqual(sortedKeys(before), sortedKeys(after)),
    stableScopedKey: first[0]?.key === expectedStoreKey && second[0]?.key === expectedStoreKey && expectedStoreKey.length > 0,
    persistedValueUnchanged: first.length === 1 && second.length === 1 && isDeepStrictEqual(first[0]!.value, second[0]!.value),
    otherRecordsUnchanged: isDeepStrictEqual(before.filter((row) => row.value.request_id !== requestId).sort((a, b) => a.key.localeCompare(b.key)), after.filter((row) => row.value.request_id !== requestId).sort((a, b) => a.key.localeCompare(b.key))),
  });
}

export interface OutboxRow { id: string; reviewItemId: string; provenance: string; payload: Json }
export interface GateEvidence {
  before: OutboxRow[]; pending: OutboxRow[]; after: OutboxRow[]; afterReplay: OutboxRow[];
  review: Json; approved: Json; replayStatus: number; expectedRecipient: string; expectedBody: string;
}
export function scoreApprovalGate(evidence: GateEvidence): Score {
  const { before, pending, after, afterReplay, review, approved } = evidence;
  const added = after.filter((row) => !before.some((old) => old.id === row.id));
  const sent = added[0], proposed = object(sent?.payload.proposed);
  return score({
    nothingBeforeApproval: before.length === 0 && isDeepStrictEqual(before, pending),
    ownerReview: review.status === "pending" && review.reviewerRole === "owner" && review.kind === "send_sample" && object(review.connection).provider === "sample_outbox",
    refundLabel: object(review.proposed).consequential === "refund_or_cancellation",
    approvalExecuted: approved.id === review.id && approved.status === "executed",
    exactlyOneOutboxEntry: added.length === 1 && after.length === before.length + 1,
    boundReview: sent?.reviewItemId === review.id,
    proposedTextBound: object(review.proposed).to === evidence.expectedRecipient && object(review.proposed).body === evidence.expectedBody && isDeepStrictEqual(proposed, review.proposed),
    onlySampleText: sent?.provenance === "mocked_integration" && sent?.payload.recipient === evidence.expectedRecipient
      && proposed.kind === "email_reply" && proposed.to === evidence.expectedRecipient && proposed.body === evidence.expectedBody
      && Object.keys(proposed).every((key) => ["kind", "to", "subject", "body", "consequential"].includes(key))
      && Object.keys(sent?.payload ?? {}).every((key) => ["proposed", "recipient"].includes(key)),
    replayRefused: evidence.replayStatus === 409,
    noDuplicateSend: isDeepStrictEqual(after, afterReplay),
  });
}
