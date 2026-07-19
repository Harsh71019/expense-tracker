export const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Ending = "never" | "until" | "count";

export type ScheduleDraft = Readonly<{
  startDate: string;
  frequency: Frequency;
  interval: number;
  weekdays: readonly Weekday[];
  monthDays: readonly number[];
  yearMonth: number;
  ending: Ending;
  untilDate: string;
  count: number;
}>;

export type ScheduleResult =
  | Readonly<{ success: true; rrule: string; summary: string }>
  | Readonly<{ success: false; message: string }>;

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday"
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function dateInputToUtc(date: string): Date {
  if (!isDateInput(date)) throw new RangeError("Choose a valid start date.");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed;
}

export function utcToDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildSchedule(draft: ScheduleDraft): ScheduleResult {
  if (!isDateInput(draft.startDate)) {
    return { success: false, message: "Choose when this rule starts." };
  }
  if (!Number.isInteger(draft.interval) || draft.interval < 1 || draft.interval > 365) {
    return { success: false, message: "Interval must be between 1 and 365." };
  }
  if (draft.frequency === "weekly" && draft.weekdays.length === 0) {
    return { success: false, message: "Choose at least one weekday." };
  }
  if (draft.frequency === "monthly" && draft.monthDays.length === 0) {
    return { success: false, message: "Choose at least one day of the month." };
  }
  if (!Number.isInteger(draft.yearMonth) || draft.yearMonth < 1 || draft.yearMonth > 12) {
    return { success: false, message: "Choose a valid month." };
  }
  if (draft.ending === "until") {
    if (!isDateInput(draft.untilDate) || draft.untilDate < draft.startDate) {
      return { success: false, message: "End date must be on or after the start date." };
    }
  }
  if (draft.ending === "count" && (!Number.isInteger(draft.count) || draft.count < 1)) {
    return { success: false, message: "Occurrence count must be at least 1." };
  }

  const frequency = draft.frequency.toUpperCase();
  const parts = [`FREQ=${frequency}`];
  if (draft.interval > 1) parts.push(`INTERVAL=${draft.interval}`);
  if (draft.frequency === "weekly") parts.push(`BYDAY=${draft.weekdays.join(",")}`);
  if (draft.frequency === "monthly") {
    const days = [...draft.monthDays].sort((left, right) => left - right);
    parts.push(`BYMONTHDAY=${days.join(",")}`);
  }
  if (draft.frequency === "yearly") parts.push(`BYMONTH=${draft.yearMonth}`);
  if (draft.ending === "until") {
    parts.push(`UNTIL=${draft.untilDate.replaceAll("-", "")}T235959Z`);
  }
  if (draft.ending === "count") parts.push(`COUNT=${draft.count}`);

  return { success: true, rrule: parts.join(";"), summary: describeSchedule(draft) };
}

export function describeSchedule(draft: ScheduleDraft): string {
  const every = draft.interval === 1 ? "Every" : `Every ${draft.interval}`;
  let cadence: string;
  if (draft.frequency === "daily") cadence = draft.interval === 1 ? "day" : "days";
  else if (draft.frequency === "weekly") {
    const days = draft.weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ");
    cadence = `${draft.interval === 1 ? "week" : "weeks"} on ${days}`;
  } else if (draft.frequency === "monthly") {
    const days = [...draft.monthDays].sort((left, right) => left - right);
    cadence = `${draft.interval === 1 ? "month" : "months"} on day ${days.join(", ")}`;
  } else {
    const month = MONTHS[draft.yearMonth - 1] ?? "the selected month";
    cadence = `${draft.interval === 1 ? "year" : "years"} in ${month}`;
  }

  let ending = "";
  if (draft.ending === "until") ending = ` until ${draft.untilDate}`;
  if (draft.ending === "count") ending = ` for ${draft.count} occurrences`;
  return `${every} ${cadence}${ending}`;
}

export function parseSchedule(rrule: string, startAt: Date): ScheduleDraft | null {
  const entries = rrule.split(";").map((part) => part.split("="));
  const values = new Map<string, string>();
  for (const entry of entries) {
    const key = entry[0];
    const value = entry[1];
    if (key === undefined || value === undefined || entry.length !== 2) return null;
    values.set(key.toUpperCase(), value.toUpperCase());
  }

  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYMONTH", "UNTIL", "COUNT"]);
  if ([...values.keys()].some((key) => !known.has(key))) return null;
  const rawFrequency = values.get("FREQ")?.toLowerCase();
  if (!isFrequency(rawFrequency)) return null;
  if (hasUnsupportedCombination(rawFrequency, values)) return null;

  const interval = integerOr(values.get("INTERVAL"), 1);
  const yearMonth = integerOr(values.get("BYMONTH"), 1);
  const weekdays = parseWeekdays(values.get("BYDAY"));
  const monthDays = parseIntegerList(values.get("BYMONTHDAY"));
  if (interval === null || yearMonth === null || weekdays === null || monthDays === null)
    return null;

  const until = values.get("UNTIL");
  const count = values.get("COUNT");
  if (until !== undefined && count !== undefined) return null;

  let ending: Ending = "never";
  let untilDate = "";
  let countValue = 1;
  if (until !== undefined) {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z)?$/.exec(until);
    if (match === null) return null;
    ending = "until";
    untilDate = `${match[1]}-${match[2]}-${match[3]}`;
  }
  if (count !== undefined) {
    const parsedCount = integerOr(count, 1);
    if (parsedCount === null) return null;
    ending = "count";
    countValue = parsedCount;
  }

  return {
    startDate: utcToDateInput(startAt),
    frequency: rawFrequency,
    interval,
    weekdays,
    monthDays,
    yearMonth,
    ending,
    untilDate,
    count: countValue
  };
}

function isFrequency(value: string | undefined): value is Frequency {
  return value !== undefined && FREQUENCIES.some((frequency) => frequency === value);
}

function hasUnsupportedCombination(
  frequency: Frequency,
  values: ReadonlyMap<string, string>
): boolean {
  if (frequency === "daily") {
    return values.has("BYDAY") || values.has("BYMONTHDAY") || values.has("BYMONTH");
  }
  if (frequency === "weekly") return values.has("BYMONTHDAY") || values.has("BYMONTH");
  if (frequency === "monthly") return values.has("BYDAY") || values.has("BYMONTH");
  return values.has("BYDAY") || values.has("BYMONTHDAY") || !values.has("BYMONTH");
}

function isDateInput(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function integerOr(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseIntegerList(value: string | undefined): readonly number[] | null {
  if (value === undefined) return [];
  const result: number[] = [];
  for (const part of value.split(",")) {
    const parsed = integerOr(part, 0);
    if (parsed === null) return null;
    result.push(parsed);
  }
  return result;
}

function parseWeekdays(value: string | undefined): readonly Weekday[] | null {
  if (value === undefined) return [];
  const result: Weekday[] = [];
  for (const part of value.split(",")) {
    if (!isWeekday(part)) return null;
    result.push(part);
  }
  return result;
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.some((weekday) => weekday === value);
}
