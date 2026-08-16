import {
  type CashflowForecastSnapshot,
  type Goal,
  type GoalFeasibilityReport,
  type GoalFeasibilityScenario,
  type GoalFeasibilityStatus,
  type GoalScenarioAllocation,
  type GoalScenarioType,
  type ProjectedCompletionRange,
  type SafetyBufferMode,
  type SafetyBufferPreference
} from "@treasury-ops/shared";

import { safeIntegerFromBigInt } from "../common/statistics/index.js";
import { toISTCalendarDate } from "../common/time/ist.js";

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;

export interface FeasibilityInput {
  readonly goals: readonly Goal[];
  readonly forecast: CashflowForecastSnapshot | null;
  readonly safetyBufferPreference: SafetyBufferPreference | null;
  readonly liquidBalanceMinor: number;
  readonly asOf: Date;
}

export interface ResolvedSafetyBuffer {
  readonly version: number | null;
  readonly mode: SafetyBufferMode;
  readonly targetMinor: number;
  readonly isFallback: boolean;
  readonly fallbackPolicy: string | null;
  readonly liquidBufferGapMinor: number;
  readonly liquidBufferSurplusMinor: number;
  readonly monthlyEssentialOutflowMinor: number;
}

function parseISTCalendarDate(date: Date): CalendarDate {
  const [year, month, day] = toISTCalendarDate(date).split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("IST calendar date did not contain year, month, and day.");
  }
  return { year, month, day };
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

function ceilDivide(dividend: number, divisor: number): number {
  if (dividend <= 0) return 0;
  if (divisor <= 0) return dividend;
  const quotient = Math.floor(dividend / divisor);
  return dividend % divisor === 0 ? quotient : quotient + 1;
}

export function resolveSafetyBufferTarget(
  pref: SafetyBufferPreference | null,
  liquidBalanceMinor: number,
  monthlyEssentialOutflowMinor: number,
  emergencyFundGoal: { readonly targetMinor: number } | null = null
): ResolvedSafetyBuffer {
  if (pref === null) {
    // Default documented fallback policy: 1 month of essential outflows
    const targetMinor = Math.max(0, monthlyEssentialOutflowMinor);
    const liquidBufferGapMinor = Math.max(0, targetMinor - liquidBalanceMinor);
    const liquidBufferSurplusMinor = Math.max(0, liquidBalanceMinor - targetMinor);

    return {
      version: null,
      mode: "essential_months",
      targetMinor,
      isFallback: true,
      fallbackPolicy: "default_1_month_essential_expenses",
      liquidBufferGapMinor,
      liquidBufferSurplusMinor,
      monthlyEssentialOutflowMinor
    };
  }

  let targetMinor = 0;
  if (pref.mode === "fixed_amount") {
    targetMinor = Math.max(0, pref.amountMinor ?? 0);
  } else if (pref.mode === "essential_months") {
    const months = pref.months ?? 1;
    targetMinor = safeIntegerFromBigInt(
      BigInt(months) * BigInt(Math.max(0, monthlyEssentialOutflowMinor)),
      "safety buffer target from essential months"
    );
  } else if (pref.mode === "emergency_fund_goal") {
    if (emergencyFundGoal) {
      targetMinor = Math.max(0, emergencyFundGoal.targetMinor);
    } else {
      targetMinor = Math.max(0, pref.amountMinor ?? 0);
    }
  }

  const liquidBufferGapMinor = Math.max(0, targetMinor - liquidBalanceMinor);
  const liquidBufferSurplusMinor = Math.max(0, liquidBalanceMinor - targetMinor);

  return {
    version: pref.version,
    mode: pref.mode,
    targetMinor,
    isFallback: false,
    fallbackPolicy: null,
    liquidBufferGapMinor,
    liquidBufferSurplusMinor,
    monthlyEssentialOutflowMinor
  };
}

export function calculateProjectedCompletionRange(
  remainingMinor: number,
  allocatedMonthlyMinor: number,
  asOf: Date
): ProjectedCompletionRange {
  if (remainingMinor <= 0) {
    return { optimisticDate: asOf, baselineDate: asOf, pessimisticDate: asOf };
  }
  if (allocatedMonthlyMinor <= 0) {
    return { optimisticDate: null, baselineDate: null, pessimisticDate: null };
  }

  const baselineMonths = ceilDivide(remainingMinor, allocatedMonthlyMinor);
  // Optimistic rate ~125% of baseline (faster funding)
  const optimisticMonthly = Math.max(1, Math.floor((allocatedMonthlyMinor * 5) / 4));
  const optimisticMonths = Math.max(1, ceilDivide(remainingMinor, optimisticMonthly));
  // Pessimistic rate ~80% of baseline (slower funding)
  const pessimisticMonthly = Math.max(1, Math.floor((allocatedMonthlyMinor * 4) / 5));
  const pessimisticMonths = Math.max(1, ceilDivide(remainingMinor, pessimisticMonthly));

  return {
    optimisticDate: addCalendarMonthsInIST(asOf, optimisticMonths),
    baselineDate: addCalendarMonthsInIST(asOf, baselineMonths),
    pessimisticDate: addCalendarMonthsInIST(asOf, pessimisticMonths)
  };
}

export function distributeProportionalRemainder(
  availableMinor: number,
  items: readonly {
    readonly id: string;
    readonly remainingMinor: number;
    readonly priority: number;
  }[]
): Map<string, number> {
  const result = new Map<string, number>();
  if (availableMinor <= 0 || items.length === 0) {
    for (const item of items) result.set(item.id, 0);
    return result;
  }

  const totalRemaining = items.reduce((sum, item) => sum + BigInt(item.remainingMinor), 0n);
  if (totalRemaining === 0n) {
    for (const item of items) result.set(item.id, 0);
    return result;
  }

  const availableBig = BigInt(availableMinor);
  let totalAllocated = 0;
  const remainders: { id: string; priority: number; remainder: bigint; remainingMinor: number }[] =
    [];

  for (const item of items) {
    const itemRemainingBig = BigInt(item.remainingMinor);
    const rawShareBig = (availableBig * itemRemainingBig) / totalRemaining;
    const share = Math.min(item.remainingMinor, Number(rawShareBig));
    const remainder = (availableBig * itemRemainingBig) % totalRemaining;

    result.set(item.id, share);
    totalAllocated += share;
    remainders.push({
      id: item.id,
      priority: item.priority,
      remainder,
      remainingMinor: item.remainingMinor
    });
  }

  let unallocated = Math.min(
    availableMinor - totalAllocated,
    safeIntegerFromBigInt(totalRemaining, "total remaining goals") - totalAllocated
  );

  if (unallocated > 0) {
    // Sort by largest remainder desc, then priority asc, then id asc
    remainders.sort((a, b) => {
      if (b.remainder !== a.remainder) {
        return b.remainder > a.remainder ? 1 : -1;
      }
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.id.localeCompare(b.id);
    });

    for (const r of remainders) {
      if (unallocated <= 0) break;
      const current = result.get(r.id) ?? 0;
      if (current < r.remainingMinor) {
        result.set(r.id, current + 1);
        unallocated -= 1;
      }
    }
  }

  return result;
}

export function evaluateScenario(
  scenarioType: GoalScenarioType,
  goals: readonly Goal[],
  availableMonthlyMinor: number,
  asOf: Date
): GoalFeasibilityScenario {
  const activeGoals = goals.filter((g) => g.status === "active");

  const sortedGoals = [...activeGoals];
  if (scenarioType === "priority_order") {
    sortedGoals.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.createdAt.getTime() !== b.createdAt.getTime()) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      return a.id.localeCompare(b.id);
    });
  } else if (scenarioType === "target_date_order") {
    sortedGoals.sort((a, b) => {
      if (a.targetDate && b.targetDate) {
        if (a.targetDate.getTime() !== b.targetDate.getTime()) {
          return a.targetDate.getTime() - b.targetDate.getTime();
        }
        return a.priority - b.priority;
      }
      if (a.targetDate && !b.targetDate) return -1;
      if (!a.targetDate && b.targetDate) return 1;
      return a.priority - b.priority;
    });
  }

  const allocations: GoalScenarioAllocation[] = [];
  let remainingBudget = availableMonthlyMinor;
  let totalAllocated = 0;

  if (scenarioType === "proportional") {
    const unachieved = sortedGoals.filter((g) => Math.max(0, g.targetMinor - g.progressMinor) > 0);
    const shares = distributeProportionalRemainder(
      availableMonthlyMinor,
      unachieved.map((g) => ({
        id: g.id,
        remainingMinor: Math.max(0, g.targetMinor - g.progressMinor),
        priority: g.priority
      }))
    );

    for (const goal of sortedGoals) {
      const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);
      const monthsRemaining =
        goal.targetDate !== undefined && goal.targetDate !== null
          ? Math.max(1, calendarMonthDistance(asOf, goal.targetDate))
          : null;
      const requiredMonthlyMinor =
        monthsRemaining !== null && remainingMinor > 0
          ? ceilDivide(remainingMinor, monthsRemaining)
          : null;

      const allocatedMonthlyMinor = remainingMinor === 0 ? 0 : (shares.get(goal.id) ?? 0);
      totalAllocated += allocatedMonthlyMinor;

      const monthlyFundingGapMinor =
        requiredMonthlyMinor !== null
          ? Math.max(0, requiredMonthlyMinor - allocatedMonthlyMinor)
          : 0;
      const monthlyFundingSurplusMinor =
        requiredMonthlyMinor !== null
          ? Math.max(0, allocatedMonthlyMinor - requiredMonthlyMinor)
          : allocatedMonthlyMinor;

      const projectedRange = calculateProjectedCompletionRange(
        remainingMinor,
        allocatedMonthlyMinor,
        asOf
      );

      let status: GoalFeasibilityStatus = "feasible";
      let explainability = "";

      if (remainingMinor === 0) {
        status = "achieved";
        explainability = "Goal target has already been achieved.";
      } else if (goal.targetDate && goal.targetDate.getTime() < asOf.getTime()) {
        status = "overdue";
        explainability = "Target date has elapsed with remaining funding required.";
      } else if (allocatedMonthlyMinor === 0) {
        status = "at_risk";
        explainability =
          "No monthly contribution available under current cash flow and safety buffer.";
      } else if (requiredMonthlyMinor !== null) {
        if (allocatedMonthlyMinor >= requiredMonthlyMinor) {
          status = "feasible";
          explainability = `Fully funded on schedule with ₹${Math.round(allocatedMonthlyMinor / 100)}/mo allocated.`;
        } else {
          status = "delayed";
          explainability = `Allocated ₹${Math.round(allocatedMonthlyMinor / 100)}/mo is below required ₹${Math.round(requiredMonthlyMinor / 100)}/mo.`;
        }
      } else {
        status = "feasible";
        explainability = `Funded at ₹${Math.round(allocatedMonthlyMinor / 100)}/mo proportional share.`;
      }

      allocations.push({
        goalId: goal.id,
        goalName: goal.name,
        priority: goal.priority,
        targetDate: goal.targetDate ?? null,
        targetMinor: goal.targetMinor,
        progressMinor: goal.progressMinor,
        remainingMinor,
        requiredMonthlyMinor,
        allocatedMonthlyMinor,
        monthlyFundingGapMinor,
        monthlyFundingSurplusMinor,
        status,
        projectedRange,
        explainability
      });
    }
  } else {
    // Priority or Target Date Water-Filling Loop
    // Pass 1: Allocate required monthly contributions in order
    const provisionalAllocations = new Map<string, number>();

    for (const goal of sortedGoals) {
      const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);
      if (remainingMinor === 0) {
        provisionalAllocations.set(goal.id, 0);
        continue;
      }

      const monthsRemaining =
        goal.targetDate !== undefined && goal.targetDate !== null
          ? Math.max(1, calendarMonthDistance(asOf, goal.targetDate))
          : null;
      const requiredMonthly =
        monthsRemaining !== null ? ceilDivide(remainingMinor, monthsRemaining) : remainingMinor;

      const desired = Math.min(requiredMonthly, remainingMinor);
      const allocated = Math.min(desired, remainingBudget);

      provisionalAllocations.set(goal.id, allocated);
      remainingBudget -= allocated;
    }

    // Pass 2: Distribute any remaining budget in sequential order to accelerate unachieved goals
    if (remainingBudget > 0) {
      for (const goal of sortedGoals) {
        if (remainingBudget <= 0) break;
        const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);
        const current = provisionalAllocations.get(goal.id) ?? 0;
        if (current < remainingMinor) {
          const extra = Math.min(remainingMinor - current, remainingBudget);
          provisionalAllocations.set(goal.id, current + extra);
          remainingBudget -= extra;
        }
      }
    }

    for (const goal of sortedGoals) {
      const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);
      const monthsRemaining =
        goal.targetDate !== undefined && goal.targetDate !== null
          ? Math.max(1, calendarMonthDistance(asOf, goal.targetDate))
          : null;
      const requiredMonthlyMinor =
        monthsRemaining !== null && remainingMinor > 0
          ? ceilDivide(remainingMinor, monthsRemaining)
          : null;

      const allocatedMonthlyMinor = provisionalAllocations.get(goal.id) ?? 0;
      totalAllocated += allocatedMonthlyMinor;

      const monthlyFundingGapMinor =
        requiredMonthlyMinor !== null
          ? Math.max(0, requiredMonthlyMinor - allocatedMonthlyMinor)
          : 0;
      const monthlyFundingSurplusMinor =
        requiredMonthlyMinor !== null
          ? Math.max(0, allocatedMonthlyMinor - requiredMonthlyMinor)
          : allocatedMonthlyMinor;

      const projectedRange = calculateProjectedCompletionRange(
        remainingMinor,
        allocatedMonthlyMinor,
        asOf
      );

      let status: GoalFeasibilityStatus = "feasible";
      let explainability = "";

      if (remainingMinor === 0) {
        status = "achieved";
        explainability = "Goal target has already been achieved.";
      } else if (goal.targetDate && goal.targetDate.getTime() < asOf.getTime()) {
        status = "overdue";
        explainability = "Target date has elapsed with remaining funding required.";
      } else if (allocatedMonthlyMinor === 0) {
        status = "at_risk";
        explainability =
          "No monthly contribution available under current cash flow and safety buffer.";
      } else if (requiredMonthlyMinor !== null) {
        if (allocatedMonthlyMinor >= requiredMonthlyMinor) {
          status = "feasible";
          explainability = `Fully funded on schedule with ₹${Math.round(allocatedMonthlyMinor / 100)}/mo allocated.`;
        } else {
          status = "delayed";
          explainability = `Allocated ₹${Math.round(allocatedMonthlyMinor / 100)}/mo is below required ₹${Math.round(requiredMonthlyMinor / 100)}/mo.`;
        }
      } else {
        status = "feasible";
        explainability = `Funded sequentially at ₹${Math.round(allocatedMonthlyMinor / 100)}/mo.`;
      }

      allocations.push({
        goalId: goal.id,
        goalName: goal.name,
        priority: goal.priority,
        targetDate: goal.targetDate ?? null,
        targetMinor: goal.targetMinor,
        progressMinor: goal.progressMinor,
        remainingMinor,
        requiredMonthlyMinor,
        allocatedMonthlyMinor,
        monthlyFundingGapMinor,
        monthlyFundingSurplusMinor,
        status,
        projectedRange,
        explainability
      });
    }
  }

  const name =
    scenarioType === "priority_order"
      ? "Priority Order"
      : scenarioType === "target_date_order"
        ? "Earliest Target Date"
        : "Proportional Allocation";

  const description =
    scenarioType === "priority_order"
      ? "Sequential allocation prioritizing highest-ranked goals first"
      : scenarioType === "target_date_order"
        ? "Allocates contributions to goals with the nearest deadlines first"
        : "Distributes available cash surplus proportionally across active goals";

  return {
    scenarioType,
    name,
    description,
    allocations,
    totalAllocatedMonthlyMinor: totalAllocated,
    unallocatedSurplusMinor: Math.max(0, availableMonthlyMinor - totalAllocated)
  };
}

export function generateFeasibilityReport(input: FeasibilityInput): GoalFeasibilityReport {
  const { goals, forecast, safetyBufferPreference, liquidBalanceMinor, asOf } = input;

  const isForecastStale =
    forecast === null || asOf.getTime() - new Date(forecast.asOf).getTime() > 7 * 86_400_000;
  const isForecastSufficient =
    forecast !== null &&
    forecast.sufficiency.status === "sufficient" &&
    forecast.metrics.eligibleForHorizon;

  const monthlyEssentialOutflowMinor =
    forecast !== null
      ? forecast.assumptions.knownRecurringOutflowMinor +
        forecast.assumptions.creditCardBillsDueMinor
      : 0;

  const emergencyGoal = safetyBufferPreference?.emergencyFundGoalId
    ? (goals.find((g) => g.id === safetyBufferPreference.emergencyFundGoalId) ?? null)
    : null;

  const resolvedBuffer = resolveSafetyBufferTarget(
    safetyBufferPreference,
    liquidBalanceMinor,
    monthlyEssentialOutflowMinor,
    emergencyGoal
  );

  // Conservative available monthly contribution calculation
  let conservativeAvailableMonthlyMinor = 0;
  let monthlySurplusMinor = 0;

  if (forecast !== null && isForecastSufficient && !isForecastStale) {
    // 30-day conservative balance delta: lowerMinor - assumptions.liquidBalanceMinor
    monthlySurplusMinor = forecast.range.lowerMinor - forecast.assumptions.liquidBalanceMinor;

    // If current liquid cash is below safety buffer, monthly surplus is directed first to buffer replenishment
    if (resolvedBuffer.liquidBufferGapMinor > 0) {
      // Buffer gap reduces available monthly surplus for other goals
      conservativeAvailableMonthlyMinor = Math.max(
        0,
        monthlySurplusMinor - resolvedBuffer.liquidBufferGapMinor
      );
    } else {
      conservativeAvailableMonthlyMinor = Math.max(0, monthlySurplusMinor);
    }
  }

  // Calculate total required monthly contribution across active goals
  const activeGoals = goals.filter((g) => g.status === "active");
  let totalRequiredMonthlyMinor = 0;

  for (const goal of activeGoals) {
    const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);
    if (remainingMinor > 0 && goal.targetDate !== undefined && goal.targetDate !== null) {
      const monthsRemaining = Math.max(1, calendarMonthDistance(asOf, goal.targetDate));
      totalRequiredMonthlyMinor += ceilDivide(remainingMinor, monthsRemaining);
    }
  }

  // Build the 3 scenarios
  const scenarios: GoalFeasibilityScenario[] = [
    evaluateScenario("priority_order", goals, conservativeAvailableMonthlyMinor, asOf),
    evaluateScenario("target_date_order", goals, conservativeAvailableMonthlyMinor, asOf),
    evaluateScenario("proportional", goals, conservativeAvailableMonthlyMinor, asOf)
  ];

  return {
    asOf,
    forecastSnapshotId: forecast?.id ?? null,
    forecastModel: forecast?.model ?? null,
    forecastComputedAt: forecast?.computedAt ?? null,
    isForecastStale,
    isForecastSufficient,
    safetyBufferVersion: resolvedBuffer.version,
    safetyBufferMode: resolvedBuffer.mode,
    safetyBufferTargetMinor: resolvedBuffer.targetMinor,
    liquidBalanceMinor,
    liquidBufferGapMinor: resolvedBuffer.liquidBufferGapMinor,
    conservativeAvailableMonthlyMinor,
    totalRequiredMonthlyMinor,
    monthlySurplusMinor,
    scenarios,
    assumptions: {
      liquidBalanceMinor,
      monthlyEssentialOutflowMinor,
      safetyBufferTargetMinor: resolvedBuffer.targetMinor,
      isFallback: resolvedBuffer.isFallback,
      fallbackPolicy: resolvedBuffer.fallbackPolicy
    }
  };
}
