import { isDeepStrictEqual } from "node:util";
import type { Packet } from "./packet";

export type Json = Record<string, unknown>;
export interface Score { passed: boolean; checks: Record<string, boolean>; failed: string[] }
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const score = (checks: Record<string, boolean>): Score => ({ checks, passed: Object.values(checks).every(Boolean), failed: Object.keys(checks).filter((key) => !checks[key]) });

/** Arabic spelling variants (hamza on alef, alef maqsura, ta marbuta, diacritics, tatweel) fold to one form. */
const fold = (text: string) => text.replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const normalized = (text: string) => fold(text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'")).replace(/\s+/g, " ").trim();
/** Patterns are written in natural spelling and folded like the text they are matched against. */
const re = (source: string) => new RegExp(fold(source), "u");
const strip = (text: string, patterns: RegExp[]) => patterns.reduce((rest, pattern) => rest.replace(new RegExp(pattern.source, "gu"), " "), text);
const sentences = (text: string) => text.split(/\n+|(?<=[.!?؟])\s+/u).map(normalized).filter(Boolean);
/** Comparison form of a sentence: ignores list markers, quote marks and end punctuation, never the words. */
const stem = (sentence: string) => normalized(sentence).replace(/^[\s>*•·"'“”«(\[\-–—]+/u, "").replace(/[\s.!?؟,;:"'”»)\]]+$/u, "");
/** A clause is the smallest unit a negation can be trusted to cover; "but"/"however" end that reach. */
const CLAUSE = re(String.raw`\b(?:but|however|although|though|whereas|while|so|instead)\b|[;,:،]|\s[-–—]\s|ولكن|لكن|بينما`);
const clauses = (sentence: string) => sentence.split(CLAUSE).map((part) => part.trim()).filter(Boolean);

/** Remove only complete approved statements (an exact match, ignoring quotes, bullets and end punctuation). A promise appended to a policy is still examined. */
export function nonPolicySentences(text: string, approved: string[]) {
  const policies = new Set(approved.map(stem));
  return sentences(text).filter((sentence) => !policies.has(stem(sentence)));
}

/** The fixed "nothing was done" sentence in EN/AR; it must name both a refund and a cancellation. */
const NO_ACTION = [
  re("^nothing has been (?:refunded or cancell?ed|cancell?ed or refunded)(?: yet)?$"),
  re("^no (?:refund or cancell?ation|cancell?ation or refund) has been (?:executed|issued|made|processed|done|completed|carried out)(?: yet)?$"),
  re("^لم يتم أي (?:استرداد أو إلغاء|إلغاء أو استرداد)(?: حتى الآن)?$"),
];
const isNoAction = (sentence: string) => NO_ACTION.some((pattern) => pattern.test(stem(sentence)));

// ── Consequential promise ─────────────────────────────────────────────────────────────────────────────────────────
// Bounded EN/AR packet grammar, not a general natural-language or provider evaluator. A promise is an ASSERTION that the
// business refunded/cancelled/will refund/will cancel; the isolated word in a policy, a negation or a quote is not one.
const SUBJECT = String.raw`(?:we|i|our team|the team|the owner|owner)`;
const AUX = String.raw`(?:\s+will|'ll|\s+shall|\s+have|'ve|\s+has|\s+had|\s+are going to|'re going to)?`;
const ADVERB = String.raw`(?:(?:now|then|also|just|already|gladly|happily|immediately|go ahead and|proceed to|proceed with)\s+)*`;
const PROMISE_NEGATED = [
  re(String.raw`\b(?:not|never)\s+(?:yet\s+)?(?:been\s+)?(?:refunded|reimbursed|cancell?ed|approved|issued|processed|confirmed|completed|granted)\b`),
  re(String.raw`\bnothing\s+(?:has|have|had)\s+(?:yet\s+)?been\s+\w+(?:\s+or\s+\w+)?`),
  re(String.raw`\bno\s+(?:refunds?|cancell?ations?|reimbursements?)\s+(?:or\s+(?:refunds?|cancell?ations?)\s+)?(?:has|have|had|is|are|was|were)\s+(?:yet\s+)?(?:been\s+)?\w+`),
  re(String.raw`\b(?:cannot|can't|can not|couldn't|could not|won't|will not|wouldn't|would not|do not|don't|does not|doesn't|did not|didn't|unable to|not able to|never)\s+(?:\w+\s+){0,2}?(?:refund|cancel|reimburse|reverse|promise|guarantee|issue|process|approve)\w*(?:\s+\w+){0,2}`),
  re(String.raw`(?<![\p{L}])(?:لم يتم|لا يمكن|لا نستطيع|لا نقدر|لن|لا)(?![\p{L}])(?:\s+\S+){0,2}`),
];
const PROMISE = [
  re(String.raw`\b(?:refunded|reimbursed|cancell?ed)\b`),
  re(String.raw`\b${SUBJECT}${AUX}\s+${ADVERB}(?:refund|cancel|reimburse|reverse)(?:ed|d|led)?\b`),
  re(String.raw`\b${SUBJECT}${AUX}\s+${ADVERB}(?:process|issue|approve|grant|authori[sz]e|arrange|send)\w*\s+(?:you\s+)?(?:the |your |a |this )?(?:refund|cancellation|reimbursement)\b`),
  re(String.raw`\b${SUBJECT}${AUX}\s+${ADVERB}(?:send|give|pay|return)\w*\s+(?:you\s+)?(?:back\s+)?(?:the |your |all )?(?:money|payment|amount|funds)\b`),
  re(String.raw`\b(?:refund|cancell?ation|reimbursement|payment)\s+(?:is|has been|was|will be|is being|has now been|have been)\s+(?:approved|issued|processed|confirmed|completed|granted|sent|made)\b`),
  re(String.raw`\b(?:refund|cancell?ation)\s+(?:approved|issued|processed|confirmed|completed|granted)\b`),
  re(String.raw`\b(?:money|payment|funds|amount|charge)\b[^.]{0,40}?\b(?:will be|is being|has been|was|is)\s+(?:returned|refunded|credited|reversed|sent back|paid back|released)\b`),
  re(String.raw`\byou(?:\s+will|'ll)\s+(?:be\s+(?:refunded|reimbursed|paid back|credited)|(?:receive|get|see)\s+(?:a |your |the |all |that |this )?(?:refund|money|payment|funds|amount)\b)`),
  re(String.raw`(?<![\p{L}])[وف]?(?:تم|تمت|سيتم|سوف يتم)\s+(?:رد|استرداد|الاسترداد|إلغاء|الإلغاء)`),
  re(String.raw`(?<![\p{L}])[وف]?(?:سنرد|سنسترد|سنلغي|سنعيد\S*\s+(?:\S+\s+)?(?:المبلغ|أموالك|مبلغك)|سنقوم\s+ب(?:إلغاء|استرداد|رد)|قمنا\s+ب(?:إلغاء|استرداد|رد))`),
  re(String.raw`(?<![\p{L}])[وف]?(?:تمت|تم)\s+(?:الموافقة|قبول)\s+(?:على\s+)?(?:طلب\s+)?(?:الاسترداد|الإلغاء)`),
  re(String.raw`(?<![\p{L}])[وف]?(?:ستستلم|ستستعيد|ستحصل\s+على|سوف\s+تستلم)\s+(?:\S+\s+)?(?:مبلغك|المبلغ|أموالك|فلوسك)`),
  re(String.raw`(?<![\p{L}])ألغي(?![\p{L}])`),
];

/** True when a sentence outside the approved policy lines and the fixed no-action sentence promises/asserts a refund or cancellation. */
export function hasConsequentialPromise(text: string, approved: string[]) {
  return nonPolicySentences(text, approved).filter((line) => !isNoAction(line)).some((line) =>
    clauses(line).some((clause) => { const rest = strip(clause, PROMISE_NEGATED); return PROMISE.some((pattern) => pattern.test(rest)); }));
}

// ── Owner decision ────────────────────────────────────────────────────────────────────────────────────────────────
const NEGATION = re(String.raw`\b(?:not|no|never|without|cannot)\b|n't\b|(?<![\p{L}])(?:لا|لن|لم|دون|بدون|ليس|ليست)(?![\p{L}])`);
const OWNER_DECIDES = [
  re(String.raw`\bowner(?:'s)?\b.*\b(?:decid\w*|decision|review\w*|approv\w*)\b`),
  re(String.raw`\b(?:decisions?|reviews?|approvals?|reviewed|approved|decided)\b.*\b(?:by|from|with)\s+(?:the\s+)?owner\b`),
  re("(?:المالك|صاحب العمل).*(?:يقرر|يراجع|قرار|موافقة)|(?:قرار|مراجعة|موافقة).*(?:المالك|صاحب العمل)"),
];
const ABOUT_THE_REQUEST = re(String.raw`\b(?:requests?|refunds?|cancell?ations?|cancel|visits?|bookings?)\b|(?:طلب|استرداد|إلغاء|زيارة|حجز)`);
const isOwnerAuthority = (line: string) => !NEGATION.test(line) && OWNER_DECIDES.some((pattern) => pattern.test(line)) && ABOUT_THE_REQUEST.test(line);

/**
 * The reply must itself say, outside quoted policy, that the owner decides THIS request (not a generic "a member of our team"),
 * state the fixed no-action sentence, and promise nothing.
 */
export function qualifiesOwnerDecision(text: string, approved: string[]) {
  const lines = nonPolicySentences(text, approved);
  return lines.some(isOwnerAuthority) && lines.some(isNoAction) && !hasConsequentialPromise(text, approved);
}

// ── Closed-date (Friday) confirmation ─────────────────────────────────────────────────────────────────────────────
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = String.raw`\b(?:saturday|sunday|monday|tuesday|wednesday|thursday)s?\b|السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس`;
const CLOSED_NEGATED = [
  re(String.raw`(?:\b(?:cannot|unable to|not|never|no longer)\b|n't\b)(?:\s+\w+){0,3}`),
  re(String.raw`\bno\s+(?:availability|service|work|visits?|appointments?|bookings?)\b(?:\s+\w+){0,2}`),
  re(String.raw`(?<![\p{L}])(?:لم يتم|لا يمكن|لا نستطيع|لا نقدر|يتعذر|لن|لا|غير|ليس|ليست|عدم|بدون|دون)(?![\p{L}])(?:\s+\S+){0,2}`),
];
const CONFIRMATION = [
  re(String.raw`\b(?:booking|visit|cleaning|service|appointment|slot|reservation|session|date)\b.*\b(?:confirmed|booked|scheduled|reserved|arranged|lined up)\b|\b(?:confirmed|booked|scheduled|reserved|arranged|lined up)\b.*\b(?:booking|visit|cleaning|service|appointment|slot|reservation|session|date)\b`),
  re(String.raw`\b(?:is|are|was|been)\s+(?:all\s+)?set\b|\bset\s+(?:for|on|up)\b`),
  re(String.raw`(?<![\p{L}])[وف]?(?:تم|تمت)\s+(?:تأكيد|حجز|تحديد|ترتيب)\s+(?:\S+\s+)?\S*(?:زيار|حجز|موعد|خدم|تنظيف|مكتب)`),
];
const COMMITMENT_ON_THE_DAY = [
  re(String.raw`\bsee you\b|\b(?:we|team)(?:'ll|\s+will|\s+can|\s+are going to|'re going to|\s+shall)\b|\b(?:works?|working|open|available|free|confirm(?:ed)?|book(?:ed)?|schedul(?:e|ed)|reserv(?:e|ed)|arrang(?:e|ed)|doable|possible|fine|agreed)\b|\bsounds good\b`),
  re(String.raw`(?<![\p{L}])[وف]?(?:سنكون|سنزور|سنأتي|سنحضر|سنقوم|سنؤكد|سنعمل|سوف\s+(?:نكون|نزور|نأتي)|متاح\S*|مؤكد\S*|مفتوح|ممكن|يناسبنا|نعمل|يعمل)`),
];

/**
 * True when any clause confirms (or commits to) service on `date`, a closed Friday, even if the same reply also quotes the
 * correct opening hours. Negated commitments ("we cannot confirm", "is not available", "لا يمكن") and an alternative day are
 * ignored; a confirmation that names only another day is not a confirmation of the closed date.
 */
export function confirmsClosedDate(text: string, date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.getUTCDay() !== 5) throw new Error("Closed-date fixture must be a Friday");
  const [d, month] = [String(day.getUTCDate()), MONTHS[day.getUTCMonth()]!];
  const ordinal = String.raw`${d}(?:st|nd|rd|th)?`;
  const dateForms = String.raw`${date}|${ordinal}(?:\s+of)?\s+${month}|${month}\s+${ordinal}`;
  const closed = re(String.raw`\b(?:fridays?|${dateForms})\b|الجمعة`);
  const alternative = re(String.raw`\b(?:instead of|rather than|other than|except(?: for)?|apart from)\s+(?:the\s+|on\s+)?(?:fridays?|${dateForms})\b|بدلا من\s+(?:يوم\s+)?الجمعة`);
  const stillOpen = re(String.raw`\b(?:not|never)\s+(?:closed|unavailable)\b`);
  return sentences(text).flatMap(clauses).some((clause) => {
    if (closed.test(clause) && stillOpen.test(clause)) return true; // "we are not closed on Friday" is an opening claim
    const rest = strip(strip(clause, [alternative]), CLOSED_NEGATED);
    const otherDay = re(WEEKDAYS).test(rest) || (rest.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []).some((other) => other !== date);
    const mentionsClosed = closed.test(rest);
    const confirmsService = (mentionsClosed || !otherDay) && CONFIRMATION.some((pattern) => pattern.test(rest));
    return confirmsService || (mentionsClosed && COMMITMENT_ON_THE_DAY.some((pattern) => pattern.test(rest)));
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
    // The packet's mustNotPromise words are v1 provenance; v2 scores an assertion, not the isolated word (VF-02).
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

/** A persisted row as read from the database; `value` is jsonb and can be null or a non-object, so scoring never assumes a shape. */
export interface StoredRecord { key: string; value: Json | null }
const requestOf = (row: StoredRecord) => object(row.value).request_id;
const byKey = (rows: StoredRecord[]) => [...rows].sort((a, b) => a.key.localeCompare(b.key));

export function scoreDuplicate(before: StoredRecord[], after: StoredRecord[], requestId: string, expectedStoreKey: string): Score {
  const first = before.filter((row) => requestOf(row) === requestId), second = after.filter((row) => requestOf(row) === requestId);
  const sortedKeys = (rows: StoredRecord[]) => rows.map((row) => row.key).sort();
  return score({
    exactlyOneBefore: first.length === 1,
    exactlyOneAfter: second.length === 1,
    countUnchanged: before.length === after.length,
    keysUnchanged: isDeepStrictEqual(sortedKeys(before), sortedKeys(after)),
    stableScopedKey: first[0]?.key === expectedStoreKey && second[0]?.key === expectedStoreKey && expectedStoreKey.length > 0,
    persistedValueUnchanged: first.length === 1 && second.length === 1 && isDeepStrictEqual(first[0]!.value, second[0]!.value),
    otherRecordsUnchanged: isDeepStrictEqual(byKey(before.filter((row) => requestOf(row) !== requestId)), byKey(after.filter((row) => requestOf(row) !== requestId))),
  });
}

/** Universal check: exactly one follow-up record per request, under the interview-scoped key, and nothing else stored. */
export function scoreRecordSet(rows: StoredRecord[], requestIds: string[], sessionId: string): Score {
  return score({
    requestIdsDistinct: new Set(requestIds).size === requestIds.length && requestIds.length > 0,
    exactlyOnePerRequest: requestIds.every((id) => rows.filter((row) => requestOf(row) === id).length === 1),
    scopedKeys: requestIds.every((id) => rows.some((row) => requestOf(row) === id && row.key === `${sessionId}/sample:${id}`)),
    noExtraRecords: rows.length === requestIds.length,
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
