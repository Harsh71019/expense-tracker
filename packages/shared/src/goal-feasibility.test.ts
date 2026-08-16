import { describe, expect, it } from "vitest";

import {
  CreateSafetyBufferPreferenceSchema,
  GoalFeasibilityReportSchema,
  GoalScenarioAllocationSchema
} from "./index.js";

describe("Safety Buffer and Goal Feasibility Schemas", () => {
  it("validates fixed_amount safety buffer preference", () => {
    const valid = CreateSafetyBufferPreferenceSchema.safeParse({
      mode: "fixed_amount",
      amountMinor: 5_000_000,
      effectiveFrom: new Date("2026-08-01")
    });
    expect(valid.success).toBe(true);

    const invalid = CreateSafetyBufferPreferenceSchema.safeParse({
      mode: "fixed_amount"
    });
    expect(invalid.success).toBe(false);
  });

  it("validates essential_months safety buffer preference", () => {
    const valid = CreateSafetyBufferPreferenceSchema.safeParse({
      mode: "essential_months",
      months: 3,
      effectiveFrom: new Date("2026-08-01")
    });
    expect(valid.success).toBe(true);

    const invalid = CreateSafetyBufferPreferenceSchema.safeParse({
      mode: "essential_months"
    });
    expect(invalid.success).toBe(false);
  });

  it("validates emergency_fund_goal safety buffer preference", () => {
    const valid = CreateSafetyBufferPreferenceSchema.safeParse({
      mode: "emergency_fund_goal",
      emergencyFundGoalId: "11111111-1111-4111-8111-111111111111"
    });
    expect(valid.success).toBe(true);

    const invalid = CreateSafetyBufferPreferenceSchema.safeParse({
      mode: "emergency_fund_goal"
    });
    expect(invalid.success).toBe(false);
  });

  it("validates GoalScenarioAllocationSchema", () => {
    const allocation = GoalScenarioAllocationSchema.safeParse({
      goalId: "11111111-1111-4111-8111-111111111111",
      goalName: "Emergency Fund",
      priority: 0,
      targetDate: "2026-12-31T00:00:00.000Z",
      targetMinor: 10_000_000,
      progressMinor: 2_000_000,
      remainingMinor: 8_000_000,
      requiredMonthlyMinor: 2_000_000,
      allocatedMonthlyMinor: 2_000_000,
      monthlyFundingGapMinor: 0,
      monthlyFundingSurplusMinor: 0,
      status: "feasible",
      projectedRange: {
        optimisticDate: "2026-11-30T00:00:00.000Z",
        baselineDate: "2026-12-31T00:00:00.000Z",
        pessimisticDate: "2027-01-31T00:00:00.000Z"
      },
      explainability: "Goal can be fully funded on schedule"
    });
    expect(allocation.success).toBe(true);
  });

  it("validates GoalFeasibilityReportSchema", () => {
    const report = GoalFeasibilityReportSchema.safeParse({
      asOf: "2026-08-01T00:00:00.000Z",
      forecastSnapshotId: "22222222-2222-4222-8222-222222222222",
      forecastModel: "trailing_median",
      forecastComputedAt: "2026-08-01T00:00:00.000Z",
      isForecastStale: false,
      isForecastSufficient: true,
      safetyBufferVersion: 1,
      safetyBufferMode: "fixed_amount",
      safetyBufferTargetMinor: 5_000_000,
      liquidBalanceMinor: 8_000_000,
      liquidBufferGapMinor: 0,
      conservativeAvailableMonthlyMinor: 3_000_000,
      totalRequiredMonthlyMinor: 2_000_000,
      monthlySurplusMinor: 1_000_000,
      scenarios: [
        {
          scenarioType: "priority_order",
          name: "Priority Order",
          description: "Fund goals sequentially in user-defined priority order",
          allocations: [],
          totalAllocatedMonthlyMinor: 0,
          unallocatedSurplusMinor: 3_000_000
        }
      ],
      assumptions: {
        liquidBalanceMinor: 8_000_000
      }
    });
    expect(report.success).toBe(true);
  });
});
