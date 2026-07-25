export type CreditCardCycle = Readonly<{
  cycleStart: Date;
  cycleEnd: Date;
  dueDate: Date;
  nextStatementAt: Date;
}>;

type CalendarParts = Readonly<{ year: number; month: number; day: number }>;

const IST_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function computeNextCreditCardStatementAt(statementDay: number, from: Date): Date {
  assertConfiguredDay(statementDay);
  const today = istCalendarParts(from);
  const thisMonth = clampedDate(today.year, today.month, statementDay);
  if (compareCalendar(thisMonth, today) >= 0) return toUtcDate(thisMonth);
  const nextMonth = addMonths({ year: today.year, month: today.month, day: 1 }, 1);
  return toUtcDate(clampedDate(nextMonth.year, nextMonth.month, statementDay));
}

export function computeCreditCardCycle(
  statementDay: number,
  dueDay: number,
  statementAt: Date
): CreditCardCycle {
  assertConfiguredDay(statementDay);
  assertConfiguredDay(dueDay);
  const cycleEndParts = utcCalendarParts(statementAt);
  const expectedEnd = clampedDate(cycleEndParts.year, cycleEndParts.month, statementDay);
  if (compareCalendar(cycleEndParts, expectedEnd) !== 0) {
    throw new RangeError("Statement date does not match the configured statement day.");
  }

  const previousMonth = addMonths({ ...cycleEndParts, day: 1 }, -1);
  const previousStatement = clampedDate(previousMonth.year, previousMonth.month, statementDay);
  const cycleStart = addDays(previousStatement, 1);

  const sameMonthDue = clampedDate(cycleEndParts.year, cycleEndParts.month, dueDay);
  const dueDate =
    compareCalendar(sameMonthDue, cycleEndParts) > 0
      ? sameMonthDue
      : (() => {
          const nextMonth = addMonths({ ...cycleEndParts, day: 1 }, 1);
          return clampedDate(nextMonth.year, nextMonth.month, dueDay);
        })();

  const nextMonth = addMonths({ ...cycleEndParts, day: 1 }, 1);
  const nextStatement = clampedDate(nextMonth.year, nextMonth.month, statementDay);

  return {
    cycleStart: toUtcDate(cycleStart),
    cycleEnd: toUtcDate(cycleEndParts),
    dueDate: toUtcDate(dueDate),
    nextStatementAt: toUtcDate(nextStatement)
  };
}

export function addUtcCalendarDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function calendarDayDistance(left: Date, right: Date): number {
  const leftParts = istCalendarParts(left);
  const rightParts = istCalendarParts(right);
  const leftUtc = toUtcDate(leftParts).getTime();
  const rightUtc = toUtcDate(rightParts).getTime();
  return Math.abs(Math.round((leftUtc - rightUtc) / 86_400_000));
}

function istCalendarParts(date: Date): CalendarParts {
  const parts = IST_CALENDAR_FORMATTER.formatToParts(date);
  return {
    year: partNumber(parts, "year"),
    month: partNumber(parts, "month"),
    day: partNumber(parts, "day")
  };
}

function utcCalendarParts(date: Date): CalendarParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: "year" | "month" | "day"): number {
  const part = parts.find((entry) => entry.type === type);
  if (part === undefined) throw new Error(`Missing ${type} in formatted calendar date.`);
  return Number.parseInt(part.value, 10);
}

function clampedDate(year: number, month: number, configuredDay: number): CalendarParts {
  return { year, month, day: Math.min(configuredDay, daysInMonth(year, month)) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(parts: CalendarParts, months: number): CalendarParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1 };
}

function addDays(parts: CalendarParts, days: number): CalendarParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return utcCalendarParts(date);
}

function toUtcDate(parts: CalendarParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function compareCalendar(left: CalendarParts, right: CalendarParts): number {
  return (
    Date.UTC(left.year, left.month - 1, left.day) - Date.UTC(right.year, right.month - 1, right.day)
  );
}

function assertConfiguredDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError("Credit card cycle day must be an integer from 1 to 31.");
  }
}
