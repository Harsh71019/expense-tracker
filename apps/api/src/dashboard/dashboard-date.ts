import type { Month } from "@treasury-ops/shared";

import { previousMonth } from "../reports/month.js";
import { toISTCalendarDate } from "../common/time/ist.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** `count` months ending at (and including) `endMonth`, oldest first. */
export function monthWindow(endMonth: Month, count: number): Month[] {
  const months: Month[] = [endMonth];
  let current = endMonth;
  for (let i = 1; i < count; i++) {
    current = previousMonth(current);
    months.unshift(current);
  }
  return months;
}

/** The UTC instant of IST midnight on the calendar day `date` falls on in IST. */
export function startOfISTDay(date: Date): Date {
  const [yearPart, monthPart, dayPart] = toISTCalendarDate(date).split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const utcMidnightSameCalendarDate = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(utcMidnightSameCalendarDate - IST_OFFSET_MS);
}

/** The last instant (23:59:59.999) of the IST calendar day `date` falls on. */
export function endOfISTDay(date: Date): Date {
  return new Date(startOfISTDay(date).getTime() + ONE_DAY_MS - 1);
}

/** The last instant of `month` in IST -- the "as of" point for a closed historical month. */
export function istMonthEndInstant(month: Month): Date {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const nextMonthFirstDayUTCMidnight = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return new Date(nextMonthFirstDayUTCMidnight - IST_OFFSET_MS - 1);
}

/** IST calendar-day keys ("YYYY-MM-DD") from `from` to `to` inclusive. */
export function listISTDayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cursor = startOfISTDay(from);
  const end = startOfISTDay(to);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toISTCalendarDate(cursor));
    cursor = new Date(cursor.getTime() + ONE_DAY_MS);
  }
  return keys;
}

/** Percent change from `previous` to `current`; `null` when `previous` is 0 (avoid divide-by-zero). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** `(income - expense) / income * 100`; 0 when there's no income to save from. */
export function savingsRatePct(incomeMinor: number, expenseMinor: number): number {
  if (incomeMinor <= 0) return 0;
  return ((incomeMinor - expenseMinor) / incomeMinor) * 100;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
