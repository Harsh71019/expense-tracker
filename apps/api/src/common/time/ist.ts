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
