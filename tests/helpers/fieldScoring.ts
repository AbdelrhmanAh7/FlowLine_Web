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
const CONFIRM = /confirm|book|schedul|available|reserved|تأكيد|مؤكد|حجز|متاح|موعد/i;

/**
 * VP-03: the requested date is a Friday (a closed day). A correct reply quotes the approved working-hours line and
 * does not present the requested date as bookable: it must not repeat the date, or name Friday together with a
 * confirming word (generic "we'll confirm the details" closings are fine).
 */
export function scoreClosedDay(text: string, requestedDate: string): boolean {
  if (!isFriday(requestedDate)) return false;
  if (!text.includes(HOURS_LINE)) return false;
  const t = toWestern(text);
  if (t.includes(requestedDate)) return false;
  const [y, m, d] = requestedDate.split("-");
  if (new RegExp(`\\b${d}[/.-]${m}[/.-]${y}\\b`).test(t)) return false;
  return !(/friday|الجمعة/i.test(t) && CONFIRM.test(t));
}

/**
 * VP-05/VP-06: a consequential reply must carry owner-decision wording (any approved phrase, case-insensitive), not
 * only the generic "A member of our team will review…" note. It checks that the owner wording is present in the
 * reply (it may come from the quoted approved policy line); it does not prove who decides the current request.
 */
export function scoreOwnerDecision(text: string, phrases: string[]): boolean {
  const low = text.toLowerCase();
  return phrases.some((q) => low.includes(q.toLowerCase()));
}
