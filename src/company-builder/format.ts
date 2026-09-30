/**
 * Follow-up time for display: always with an explicit time zone (never an implicit local time). Arabic uses Arabic-Indic
 * digits and the Gregorian calendar. `dateStyle`/`timeStyle` can't be combined with `timeZoneName`, so fields are
 * listed explicitly. An unknown zone falls back to UTC (named), and an invalid date to the raw ISO string.
 */
export function formatDue(iso: string, locale: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" };
  const make = (tz: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-arab-ca-gregory" : "en-GB", { ...opts, timeZone: tz }).format(date);
  try {
    return make(timeZone);
  } catch {
    return make("UTC");
  }
}
