import {
  MonthSchema,
  type AccountInsightsBucket,
  type AccountInsightsRange
} from "@treasury-ops/shared";

import {
  addDaysUtc,
  addMonthsInIST,
  istCalendarDateStartUtc,
  istMonthBounds,
  toISTCalendarDate,
  toISTMonth
} from "../common/time/ist.js";

export type AccountInsightsWindow = Readonly<{
  range: AccountInsightsRange;
  from: Date;
  to: Date;
  toExclusive: Date;
  bucket: AccountInsightsBucket;
  periods: readonly string[];
}>;

function monthStart(date: Date): Date {
  return istMonthBounds(MonthSchema.parse(toISTMonth(date))).start;
}

function listDayPeriods(from: Date, toExclusive: Date): string[] {
  const periods: string[] = [];
  for (let cursor = from; cursor < toExclusive; cursor = addDaysUtc(cursor, 1)) {
    periods.push(toISTCalendarDate(cursor));
  }
  return periods;
}

function listMonthPeriods(from: Date, toExclusive: Date): string[] {
  const periods: string[] = [];
  for (let cursor = from; cursor < toExclusive; cursor = addMonthsInIST(cursor, 1)) {
    periods.push(`${toISTMonth(cursor)}-01`);
  }
  return periods;
}

export function buildAccountInsightsWindow(
  range: AccountInsightsRange,
  accountCreatedAt: Date,
  now = new Date()
): AccountInsightsWindow {
  const today = istCalendarDateStartUtc(now);
  const toExclusive = addDaysUtc(today, 1);
  const bucket: AccountInsightsBucket = range === "30d" || range === "90d" ? "day" : "month";
  const from =
    range === "30d"
      ? addDaysUtc(today, -29)
      : range === "90d"
        ? addDaysUtc(today, -89)
        : range === "1y"
          ? addMonthsInIST(monthStart(now), -11)
          : monthStart(accountCreatedAt);
  const periods =
    bucket === "day" ? listDayPeriods(from, toExclusive) : listMonthPeriods(from, toExclusive);

  return {
    range,
    from,
    to: new Date(toExclusive.getTime() - 1),
    toExclusive,
    bucket,
    periods
  };
}
