import type { DateFormat } from "@treasury-ops/shared";

type DateParts = Readonly<{ year: number; month: number; day: number }>;

const FORMAT_PATTERNS: Record<
  DateFormat,
  { regex: RegExp; toParts: (match: RegExpExecArray) => DateParts }
> = {
  "DD/MM/YYYY": {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    toParts: (match) => ({ day: toInt(match[1]), month: toInt(match[2]), year: toInt(match[3]) })
  },
  "MM/DD/YYYY": {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    toParts: (match) => ({ month: toInt(match[1]), day: toInt(match[2]), year: toInt(match[3]) })
  },
  "YYYY-MM-DD": {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    toParts: (match) => ({ year: toInt(match[1]), month: toInt(match[2]), day: toInt(match[3]) })
  }
};

/**
 * Parses a calendar date against an explicitly-declared format — never
 * auto-detected. Per BACKEND.md §4: "enforce explicit dateFormat from the
 * mapping, never auto-guess, that's how 04/07 becomes April 7th."
 *
 * Rejects anything that isn't a real calendar date (e.g. 30/02/2026) rather
 * than silently rolling it over to March, which is what `new Date(...)` does
 * by default.
 *
 * The returned Date is UTC midnight of that calendar day. Bank-statement
 * dates carry no time component, and UTC midnight of day D always renders
 * back as day D under `toISTCalendarDate` (IST is UTC+5:30, so it only ever
 * moves later within the same day).
 */
export function parseExplicitDate(input: string, format: DateFormat): Date {
  const trimmed = input.trim();
  const pattern = FORMAT_PATTERNS[format];
  const match = pattern.regex.exec(trimmed);
  if (match === null) {
    throw new RangeError(`"${input}" does not match the expected date format ${format}.`);
  }

  const { year, month, day } = pattern.toParts(match);
  if (month < 1 || month > 12) {
    throw new RangeError(`"${input}" has an out-of-range month for format ${format}.`);
  }
  if (day < 1 || day > 31) {
    throw new RangeError(`"${input}" has an out-of-range day for format ${format}.`);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!roundTrips) {
    throw new RangeError(`"${input}" is not a real calendar date under format ${format}.`);
  }

  return date;
}

function toInt(value: string | undefined): number {
  if (value === undefined) {
    throw new RangeError("Date component is missing.");
  }
  return Number.parseInt(value, 10);
}
