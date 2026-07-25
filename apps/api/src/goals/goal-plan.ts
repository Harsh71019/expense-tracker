import { GoalPlanSchema, type Goal, type GoalPlan } from "@treasury-ops/shared";

import { toISTCalendarDate } from "../common/time/ist.js";

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;

export function calculateGoalPlan(goal: Goal, now: Date): GoalPlan {
  const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);

  if (goal.targetDate !== undefined) {
    const monthsRemaining = Math.max(1, calendarMonthDistance(now, goal.targetDate));
    return GoalPlanSchema.parse({
      goalId: goal.id,
      mode: "target_date",
      requiredMonthlyMinor: ceilDivide(remainingMinor, monthsRemaining),
      projectedCompletionDate: null
    });
  }

  if (remainingMinor === 0) {
    return GoalPlanSchema.parse({
      goalId: goal.id,
      mode: "at_current_rate",
      requiredMonthlyMinor: null,
      projectedCompletionDate: now
    });
  }

  const monthsSinceCreated = Math.max(1, calendarMonthDistance(goal.createdAt, now));
  const averageMonthlyMinor = Math.floor(goal.progressMinor / monthsSinceCreated);
  const projectedMonths =
    averageMonthlyMinor > 0 ? ceilDivide(remainingMinor, averageMonthlyMinor) : null;

  return GoalPlanSchema.parse({
    goalId: goal.id,
    mode: "at_current_rate",
    requiredMonthlyMinor: null,
    projectedCompletionDate:
      projectedMonths === null ? null : addCalendarMonthsInIST(now, projectedMonths)
  });
}

function calendarMonthDistance(from: Date, to: Date): number {
  const fromParts = parseISTCalendarDate(from);
  const toParts = parseISTCalendarDate(to);
  return (toParts.year - fromParts.year) * 12 + toParts.month - fromParts.month;
}

function addCalendarMonthsInIST(date: Date, months: number): Date {
  const parts = parseISTCalendarDate(date);
  const firstOfDestination = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const destinationYear = firstOfDestination.getUTCFullYear();
  const destinationMonth = firstOfDestination.getUTCMonth();
  const lastDay = new Date(Date.UTC(destinationYear, destinationMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(destinationYear, destinationMonth, Math.min(parts.day, lastDay)));
}

function parseISTCalendarDate(date: Date): CalendarDate {
  const [year, month, day] = toISTCalendarDate(date).split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("IST calendar date did not contain year, month, and day.");
  }
  return { year, month, day };
}

function ceilDivide(dividend: number, divisor: number): number {
  if (dividend === 0) return 0;
  const quotient = Math.floor(dividend / divisor);
  return dividend % divisor === 0 ? quotient : quotient + 1;
}
