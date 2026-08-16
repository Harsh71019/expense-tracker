import type { BudgetPace } from "@treasury-ops/shared";

import { buildRollingOriginPlan } from "../common/algorithm-evaluation/index.js";
import { discreteMedian, discreteQuantile } from "../common/statistics/index.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { computeUtilizationBps } from "./budget-progress.js";

export const BUDGET_PACE_POLICY_VERSION = 1;
export const BUDGET_PACE_LOOKBACK_MONTHS = 12;
export const BUDGET_PACE_MAX_CATEGORIES = 100;
export const BUDGET_PACE_MAX_DAILY_ROWS = 10_000;
export const BUDGET_PACE_MIN_HISTORY_MONTHS = 3;
const BPS = 10_000;
const FLOOR_BPS = 500;

export type DailyCategorySpend = Readonly<{ categoryId: string; day: string; spentMinor: number }>;

type MonthlyCurve = Readonly<{
  month: string;
  finalMinor: number;
  daily: ReadonlyMap<string, number>;
}>;

function divide(numerator: number, denominator: number): number {
  return Number(BigInt(numerator) / BigInt(denominator));
}

function monthDays(month: string): number {
  const [year, numberMonth] = month.split("-").map(Number);
  if (year === undefined || numberMonth === undefined) throw new RangeError("Invalid IST month.");
  return new Date(Date.UTC(year, numberMonth, 0)).getUTCDate();
}

function dayOfMonth(date: Date): number {
  const day = Number(toISTCalendarDate(date).slice(8, 10));
  if (!Number.isSafeInteger(day) || day < 1) throw new RangeError("Invalid IST day.");
  return day;
}

function shareAt(curve: MonthlyCurve, positionBps: number): number {
  const days = monthDays(curve.month);
  const targetDay = Math.min(days, Math.max(1, Math.ceil((positionBps * days) / BPS)));
  let cumulative = 0;
  for (const [day, spend] of curve.daily) {
    if (Number(day.slice(8, 10)) <= targetDay) cumulative += spend;
  }
  return divide(cumulative * BPS, curve.finalMinor);
}

function projected(spentMinor: number, shareBps: number): number {
  return divide(spentMinor * BPS, Math.max(shareBps, FLOOR_BPS));
}

function absent(asOf: Date, evidence: BudgetPace["evidence"], historyMonths: number): BudgetPace {
  return {
    method: "abstain",
    version: BUDGET_PACE_POLICY_VERSION,
    asOf,
    inputWatermark: asOf,
    historyMonths,
    isSufficient: false,
    evidence,
    confidenceBps: 0,
    expectedSpentMinor: null,
    paceDeltaMinor: null,
    paceRatioBps: null,
    projectedMonthEndMinor: null,
    projectedRangeLowMinor: null,
    projectedRangeHighMinor: null,
    projectedUtilizationBps: null
  };
}

/**
 * Calendar-normalized, integer-only pace calculation. Complete historical
 * months are the only training input; callers must pass no rows after asOf.
 */
export function buildBudgetPace(
  input: Readonly<{
    categoryId: string;
    month: string;
    asOf: Date;
    spentMinor: number;
    limitMinor: number;
    effective: boolean;
    rows: readonly DailyCategorySpend[];
    resourceLimited: boolean;
  }>
): BudgetPace {
  if (!input.effective) return absent(input.asOf, ["ineffective_budget"], 0);
  if (input.resourceLimited) return absent(input.asOf, ["resource_limit"], 0);
  const curves = new Map<string, Map<string, number>>();
  for (const row of input.rows) {
    if (
      row.categoryId !== input.categoryId ||
      row.day.slice(0, 7) >= input.month ||
      row.day > toISTCalendarDate(input.asOf)
    )
      continue;
    const daily = curves.get(row.day.slice(0, 7)) ?? new Map<string, number>();
    daily.set(row.day, (daily.get(row.day) ?? 0) + row.spentMinor);
    curves.set(row.day.slice(0, 7), daily);
  }
  const complete = [...curves.entries()]
    .map(([month, daily]) => ({
      month,
      daily,
      finalMinor: [...daily.values()].reduce((sum, amount) => sum + amount, 0)
    }))
    .filter((curve) => curve.finalMinor > 0)
    .sort((left, right) => left.month.localeCompare(right.month));
  const elapsedBps = divide(dayOfMonth(input.asOf) * BPS, monthDays(input.month));
  const linearShare = Math.max(1, elapsedBps);
  if (complete.length < BUDGET_PACE_MIN_HISTORY_MONTHS) {
    const value = projected(input.spentMinor, linearShare);
    return {
      method: "linear_calendar",
      version: BUDGET_PACE_POLICY_VERSION,
      asOf: input.asOf,
      inputWatermark: input.asOf,
      historyMonths: complete.length,
      isSufficient: false,
      evidence: ["insufficient_history"],
      confidenceBps: 2_500,
      expectedSpentMinor: divide(input.limitMinor * linearShare, BPS),
      paceDeltaMinor: input.spentMinor - divide(input.limitMinor * linearShare, BPS),
      paceRatioBps: computeUtilizationBps(
        input.spentMinor,
        Math.max(1, divide(input.limitMinor * linearShare, BPS))
      ),
      projectedMonthEndMinor: value,
      projectedRangeLowMinor: null,
      projectedRangeHighMinor: null,
      projectedUtilizationBps: computeUtilizationBps(value, input.limitMinor)
    };
  }
  const shares = complete.map((curve) => shareAt(curve, elapsedBps));
  const median = Math.max(1, discreteMedian(shares));
  const lower = Math.max(1, discreteQuantile(shares, 2_500));
  const upper = Math.max(1, discreteQuantile(shares, 7_500));
  const expected = divide(input.limitMinor * median, BPS);
  const value = projected(input.spentMinor, median);
  return {
    method: "historical_curve",
    version: BUDGET_PACE_POLICY_VERSION,
    asOf: input.asOf,
    inputWatermark: input.asOf,
    historyMonths: complete.length,
    isSufficient: true,
    evidence: ["eligible_history"],
    confidenceBps: Math.min(9_000, 5_000 + complete.length * 500),
    expectedSpentMinor: expected,
    paceDeltaMinor: input.spentMinor - expected,
    paceRatioBps: computeUtilizationBps(input.spentMinor, Math.max(1, expected)),
    projectedMonthEndMinor: value,
    projectedRangeLowMinor: projected(input.spentMinor, upper),
    projectedRangeHighMinor: projected(input.spentMinor, lower),
    projectedUtilizationBps: computeUtilizationBps(value, input.limitMinor)
  };
}

/** Chronological PR-04 harness plan; each held-out month sees earlier months only. */
export function budgetPaceEvaluationOrigins(months: readonly string[]): number {
  return buildRollingOriginPlan(
    months.map((value, time) => ({ time, value })),
    {
      minimumTrainingSize: BUDGET_PACE_MIN_HISTORY_MONTHS,
      horizonSize: 1,
      stepSize: 1,
      maxOrigins: 12
    }
  ).evaluatedOriginCount;
}
