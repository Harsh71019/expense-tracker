const MONTH_FORMAT = /^(\d{4})-(\d{2})$/;

function parseMonth(month: string): { year: number; monthIndex: number } {
  const match = MONTH_FORMAT.exec(month);
  if (match === null) throw new RangeError(`Invalid month key: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return { year, monthIndex };
}

function toMonthKey(year: number, monthIndex: number): string {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const { year, monthIndex } = parseMonth(month);
  return toMonthKey(year, monthIndex + delta);
}

/** The current calendar month in Asia/Kolkata, as a YYYY-MM key. */
export function currentMonthInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** The last calendar month that could plausibly have a completed rollup. */
export function defaultReportMonth(): string {
  return shiftMonth(currentMonthInIndia(), -1);
}

/** `count` months ending at `month`, oldest first. */
export function recentMonths(month: string, count: number): string[] {
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    months.push(shiftMonth(month, -offset));
  }
  return months;
}

export function monthLabel(month: string, style: "short" | "long" = "long"): string {
  const { year, monthIndex } = parseMonth(month);
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: style,
    year: style === "short" ? "2-digit" : "numeric",
    timeZone: "UTC"
  }).format(date);
}
