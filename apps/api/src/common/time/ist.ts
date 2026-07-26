const IST_TIME_ZONE = "Asia/Kolkata";

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/**
 * Renders a Date as its Asia/Kolkata calendar date (YYYY-MM-DD), independent
 * of the instant's UTC offset or the host's local timezone. Used anywhere a
 * value must bucket by "which day this was in India" — dedupe hashing, cron
 * idempotency keys — never `Date#getMonth()`/`getDate()`, which reflect the
 * host machine's timezone.
 */
export function toISTCalendarDate(date: Date): string {
  const parts = calendarDateFormatter.formatToParts(date);
  const lookup = (type: "year" | "month" | "day"): string => {
    const part = parts.find((entry) => entry.type === type);
    if (part === undefined) {
      throw new Error(`Intl.DateTimeFormat did not produce a "${type}" part.`);
    }
    return part.value;
  };

  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

/** The "YYYY-MM" bucket a Date falls into under Asia/Kolkata — the rollup key. */
export function toISTMonth(date: Date): string {
  return toISTCalendarDate(date).slice(0, 7);
}

// IST (Asia/Kolkata) is a fixed UTC+5:30 offset year-round — no DST — so this
// constant is safe to hardcode rather than deriving it per-call.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseCalendarDateParts(calendarDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const parts = calendarDate.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return { year, month, day };
}

/**
 * The UTC instant of 00:00 Asia/Kolkata for the IST calendar day containing
 * `date` — spending-warning analysis boundary (plan §4): "the start of the
 * current IST calendar date," used so every window comparison uses
 * completed IST days.
 */
export function istCalendarDateStartUtc(date: Date): Date {
  const { year, month, day } = parseCalendarDateParts(toISTCalendarDate(date));
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Adds (or subtracts, for negative `days`) whole days to a UTC instant. */
export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

/**
 * The Monday-based ISO week start (YYYY-MM-DD, IST calendar) containing
 * `date`. Used only as a stable episode key for spending-warning
 * fingerprints (plan §5) — not a detection window boundary. Calendar
 * arithmetic is done on the Y/M/D label itself (safe: it never crosses a
 * DST boundary because IST has none), not on the real UTC instant.
 */
export function toISTWeekStart(date: Date): string {
  const { year, month, day } = parseCalendarDateParts(toISTCalendarDate(date));
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = asUtc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  asUtc.setUTCDate(asUtc.getUTCDate() - daysSinceMonday);
  return asUtc.toISOString().slice(0, 10);
}
