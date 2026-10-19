/**
 * Pure scoring predicates of the Company Builder field-validation harness (packet v2, #142), kept apart from
 * `field.spec.ts` so unit tests can pin them with fixture replies (no stack, no model).
 */
export const HOURS_LINE = "We work Saturday to Thursday, 9:00 to 18:00.";

// Packet dates are date-only ISO strings (YYYY-MM-DD or YYYY.MM.DD) with no time component, so they parse as UTC midnight and
// getUTCDay() is the calendar weekday (0 = Sunday, 5 = Friday). No Africa/Cairo conversion is needed.
export function isFriday(isoDate: string): boolean {
  return new Date(`${isoDate.replace(/\./g, "-")}T00:00:00Z`).getUTCDay() === 5;
}

// Western and Arabic-Indic digits, so the Arabic-language VP-03 reply is covered too.
const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const CONFIRM =
  /confirm|book|schedul|available|reserved|\bset for\b|see you|expect you|we'll visit|we will visit|\bopen\b|\boperate\b|\bservicing\b|تأكيد|مؤكد|حجز|متاح|موعد|مفتوح|نفتح|نعمل|نقدم الخدمة/i;
// A sentence that says the day is closed / not available is the correct answer, not a confirmation.
// This negation only applies to general Friday statements; it does NOT override a specific date confirmation.
const NEGATION = /\bclosed\b|\bnot\b|n't\b|\bunavailable\b|\bcannot\b|مغلق|(?:^|\s)(?:لا|غير)\s/i;
// Patterns where a confirmation word is directly negated (e.g. "not available", "not confirmed", "cannot book").
// JS `\b` is ASCII-only (no boundary between an Arabic letter and a space), so the Arabic branch ends with a Unicode-aware
// lookahead (`u` flag) instead, and accommodates inflections (feminine ة, tatweel ـة, plural ون/ين/ات) and Arabic diacritics/tanwin.
const NEGATED_CONFIRM =
  /\bnot\s+(?:available|confirmed|booked|scheduled|reserved)\b|\bunavailable\b|\bcannot\s+(?:book|schedule|reserve)\b|(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ـ?ة|ون|ين|ات)?[\u064B-\u0652]*(?![\p{L}\p{N}])/iu;
const FRIDAY = /friday|الجمعة/i;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export const escapeRegex = escapeRegExp;

/**
 * VP-03: the requested date is a Friday (a closed day). A correct reply quotes the approved working-hours line and
 * does not present the requested date as bookable. It is judged sentence by sentence, so the generic closing
 * "Thank you, we'll confirm the details" (no mention of the day) is fine, and "We are closed on Fridays." passes. A
 * sentence fails when it repeats the requested date or names Friday together with a confirming word, unless that
 * same sentence says the day is closed or not available. A specific date confirmation (e.g. "2026-10-09 is confirmed")
 * always fails, even if the same sentence mentions "closed" in a general sense.
 */
export function scoreClosedDay(text: string, requestedDate: string): boolean {
  if (!isFriday(requestedDate)) return false;
  if (!text.includes(HOURS_LINE)) return false;
  const t = toWestern(text);
  const [y = "", m = "", d = ""] = requestedDate.split(/[-/.]/);
  const dateForms = new RegExp(
    `${escapeRegExp(requestedDate)}|\\b${escapeRegExp(d)}[/.-]${escapeRegExp(m)}[/.-]${escapeRegExp(y)}\\b|\\b${escapeRegExp(y)}[/.-]${escapeRegExp(m)}[/.-]${escapeRegExp(d)}\\b`
  );
  // Clauses (split at punctuation and conjunctions "and/while/but/whereas"), so a negation elsewhere in the sentence ("..., while
  // later slots are not available") cannot suppress the confirmation of the requested date.
  return !t.split(/[!?؟\n,;،؛]+|\.(?=\s|$)|\b(?:and|while|but|whereas|although|though)\b|\s+و(?=[\p{L}])/iu).some((rawSentence) => {
    // Normalise or strip Arabic diacritics (U+064B–U+0652) from the clause before matching
    const sentence = rawSentence.replace(/[\u064B-\u0652]/g, "");
    const hasDateForm = dateForms.test(sentence) || dateForms.test(rawSentence);
    const hasFridayConfirm = FRIDAY.test(sentence) && CONFIRM.test(sentence);
    // A specific date confirmation always fails unless the confirmation itself is negated.
    // If affirmative confirmation words remain outside of any negated confirmation, it fails.
    if (hasDateForm && (CONFIRM.test(sentence) || CONFIRM.test(rawSentence))) {
      const withoutNegated = sentence.replace(new RegExp(NEGATED_CONFIRM.source, "giu"), " ");
      if (CONFIRM.test(withoutNegated)) return true;
      if (NEGATED_CONFIRM.test(sentence) || NEGATED_CONFIRM.test(rawSentence)) return false;
      return true;
    }
    // For Friday+confirm without a specific date, allow negation to override (e.g. "We are closed on Fridays.")
    if (hasFridayConfirm) {
      if (NEGATION.test(sentence) || NEGATION.test(rawSentence)) return false;
      return true;
    }
    return false;
  });
}

// A reply that hands the decision to someone other than the owner contradicts "refunds and cancellations are decided by
// the owner". It is the decision/review verb that must be attached to the non-owner party: "a member of our team will
// contact you with that decision" does not decide anything, "the billing manager will decide" does. The gap between
// party and verb stops at punctuation, so "the owner will decide; a team member will contact you" is not misread.
const TEAM_DECIDER =
  /\b(?:team|colleague|staff|manager|supervisor|accountant|bookkeeper|admin(?:istrator)?|agent|employee|someone|somebody|billing|finance|support)\b[^.!?\n;,]{0,40}?\b(?:(?:will|shall|would|must|can|may)\s+(?:also\s+|then\s+)?)?(?:decides?|reviews?|approves?|rejects?|refuses?|grants?|handles?|processes?|assesses?|determines?|deciding|reviewing|approving)\b|\b(?:decided|reviewed|approved|rejected|handled|processed|assessed|determined)\s+by\s+(?:our|the|a|an)\s+(?:team|colleague|staff|manager|supervisor|accountant|bookkeeper|admin(?:istrator)?|agent|employee|someone|somebody|billing|finance|support)\b|(?:فريق\s+العمل|أحد\s+الموظفين|خدمة\s+العملاء|الدعم)\s+(?:سوف\s+)?س?(?:يقرر|تقرر|يراجع|تراجع|يعتمد|تعتمد)/iu;

// The owner as the decider in the reply's own words, beyond the packet's two literal phrases: the product says "The
// business owner decides this refund or cancellation request." (run 6), which the literal list missed, and supports Arabic owner wording.
const OWNER_DECIDER =
  /\bowner\s+(?:(?:will|shall|must)\s+)?(?:decides?|reviews?|approves?)\b|\b(?:decided|reviewed|approved)\s+by\s+the\s+(?:business\s+)?owner\b|(?:المالك|صاحب\s+العمل)\s+(?:سوف\s+)?س?(?:يقرر|تقرر|يراجع|تراجع|يعتمد|تعتمد)|(?:القرار|المراجعة)\s+بيد\s+(?:المالك|صاحب\s+العمل)|(?:مقرر|مراجَع|معتمَد)\s+من\s+قبل\s+(?:المالك|صاحب\s+العمل)/iu;

/**
 * VP-05/VP-06 owner-decision rule: pass only if the reply says the decision or review is by the owner (المالك / صاحب العمل / owner,
 * via packet phrases or an owner-decides sentence) and does not assign it to a team member, staff, agent, or the assistant itself.
 * Fail if the decision is attributed only to a team member, staff, agent or the assistant itself, or if there is no decision wording.
 * Approved policy quotes are removed first: their "reviewed by the owner" text describes general policy, not who decides this request.
 */
export function scoreOwnerDecision(text: string, phrases: string[], approvedQuotes: string[]): boolean {
  let own = text;
  for (const q of approvedQuotes) {
    const trimmed = q.replace(/[.!?:;]+$/, "");
    const pattern = new RegExp(escapeRegExp(trimmed) + "[.!?:;]*", "gi");
    own = own.replace(pattern, " ");
  }
  if (TEAM_DECIDER.test(own)) return false;
  const low = own.toLowerCase();
  return phrases.some((q) => low.includes(q.toLowerCase())) || OWNER_DECIDER.test(own);
}
