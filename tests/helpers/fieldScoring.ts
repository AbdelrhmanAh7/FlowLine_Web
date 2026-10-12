/**
 * Pure scoring predicates of the Company Builder field-validation harness (packet v2, #142), kept apart from
 * `field.spec.ts` so unit tests can pin them with fixture replies (no stack, no model).
 */
export const HOURS_LINE = "We work Saturday to Thursday, 9:00 to 18:00.";

// Packet dates are date-only ISO strings (YYYY-MM-DD) with no time component, so they parse as UTC midnight and
// getUTCDay() is the calendar weekday (0 = Sunday, 5 = Friday). No Africa/Cairo conversion is needed.
export function isFriday(isoDate: string): boolean {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 5;
}

// Western and Arabic-Indic digits, so the Arabic-language VP-03 reply is covered too.
const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const CONFIRM = /confirm|book|schedul|available|reserved|\bset for\b|see you|expect you|we'll visit|we will visit|تأكيد|مؤكد|حجز|متاح|موعد/i;
// A sentence that says the day is closed / not available is the correct answer, not a confirmation.
// This negation only applies to general Friday statements; it does NOT override a specific date confirmation.
const NEGATION = /\bclosed\b|\bnot\b|n't\b|\bunavailable\b|\bcannot\b|مغلق|(?:^|\s)(?:لا|غير)\s/i;
// Patterns where a confirmation word is directly negated (e.g. "not available", "not confirmed", "cannot book").
// JS `\b` is ASCII-only (no boundary between an Arabic letter and a space), so the Arabic branch ends with a Unicode-aware
// lookahead (`u` flag) instead.
const NEGATED_CONFIRM = /\bnot\s+(?:available|confirmed|booked|scheduled|reserved)\b|\bunavailable\b|\bcannot\s+(?:book|schedule|reserve)\b|(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?![\p{L}\p{N}])/iu;
const FRIDAY = /friday|الجمعة/i;

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
  const [y, m, d] = requestedDate.split("-");
  const dateForms = new RegExp(`${requestedDate}|\\b${d}[/.-]${m}[/.-]${y}\\b`);
  // Clauses (split at commas, semicolons, "while/but/whereas"), so a negation elsewhere in the sentence ("..., while
  // later slots are not available") cannot suppress the confirmation of the requested date.
  return !t.split(/[!?؟\n,;،؛]+|\.(?=\s|$)|\b(?:while|but|whereas)\b/i).some((sentence) => {
    const hasDateForm = dateForms.test(sentence);
    const hasFridayConfirm = FRIDAY.test(sentence) && CONFIRM.test(sentence);
    // A specific date confirmation always fails, even with a general "closed" word in the same sentence,
    // unless the confirmation is explicitly negated (e.g. "2026-10-09 is not available").
    if (hasDateForm && CONFIRM.test(sentence)) {
      if (NEGATED_CONFIRM.test(sentence)) return false;
      return true;
    }
    // For Friday+confirm without a specific date, allow negation to override (e.g. "We are closed on Fridays.")
    if (hasFridayConfirm) {
      if (NEGATION.test(sentence)) return false;
      return true;
    }
    return false;
  });
}

// A reply that hands the decision to a generic team member contradicts "refunds and cancellations are decided by the owner".
const TEAM_DECIDER = /member of (?:our|the) team|(?:our|the) team (?:will|shall)|team member (?:will|shall)/i;

/**
 * VP-05/VP-06: the reply's own wording must attribute the decision to the owner (any phrase, case-insensitive) and
 * must not assign it to a team member. Approved policy quotes are removed first: their "reviewed by the owner" text
 * describes the policy, not who decides this request.
 */
export function scoreOwnerDecision(text: string, phrases: string[], approvedQuotes: string[]): boolean {
  const own = approvedQuotes.reduce((t, q) => t.split(q).join(" "), text);
  if (TEAM_DECIDER.test(own)) return false;
  const low = own.toLowerCase();
  return phrases.some((q) => low.includes(q.toLowerCase()));
}
