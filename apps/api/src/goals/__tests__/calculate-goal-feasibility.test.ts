import type { CashflowForecastSnapshot, Goal, SafetyBufferPreference } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  calculateProjectedCompletionRange,
  distributeProportionalRemainder,
  evaluateScenario,
  generateFeasibilityReport,
  resolveSafetyBufferTarget
} from "../calculate-goal-feasibility.js";

describe("calculate-goal-feasibility pure functions", () => {
  const asOf = new Date("2026-08-01T00:00:00.000Z");

  const dummyForecast: CashflowForecastSnapshot = {
    id: "22222222-2222-4222-8222-222222222222",
    asOf: new Date("2026-08-01T00:00:00.000Z"),
    horizonDays: 30,
    modelVersion: 1,
    inputWatermark: {
      asOf: new Date("2026-08-01T00:00:00.000Z"),
      latestOccurredAt: new Date("2026-08-01T00:00:00.000Z"),
      latestUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
      rowCount: 50,
      digest: "a".repeat(64)
    },
    sufficiency: {
      status: "sufficient",
      observationCount: 90,
      minimumRequired: 30
    },
    resources: {
      rowsScanned: 50,
      runtimeMs: 10,
      rowBudgetHit: false,
      timedOut: false,
      outcome: { status: "completed" }
    },
    model: "trailing_median",
    pointBalanceMinor: 15_000_000,
    range: {
      lowerMinor: 12_000_000,
      upperMinor: 18_000_000,
      observedCoverageBps: 8000,
      label: "historical_range"
    },
    assumptions: {
      liquidBalanceMinor: 10_000_000,
      knownRecurringInflowMinor: 20_000_000,
      knownRecurringOutflowMinor: 5_000_000,
      creditCardBillsDueMinor: 2_000_000,
      excludedCreditCardPurchaseCount: 10,
      excludedTransferCount: 2,
      variableSpendExcludedRecurringCount: 5,
      asOfDeterministic: true
    },
    metrics: {
      evaluatedOriginCount: 10,
      maeMinor: 100_000,
      maseBps: 8000,
      baselineMaeMinor: 120_000,
      residualCount: 30,
      observedCoverageBps: 8000,
      eligibleForHorizon: true
    },
    shortfall: {
      hasPotentialShortfall: false,
      firstPotentialShortfallDate: null,
      conservativeBalanceMinor: 12_000_000,
      mode: "read_only"
    },
    computedAt: new Date("2026-08-01T00:00:00.000Z")
  };

  const goalA: Goal = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: "user-test",
    name: "Emergency Fund",
    targetMinor: 6_000_000, // 60,000 INR
    progressMinor: 2_000_000, // 20,000 INR remaining = 40,000 INR
    targetDate: new Date("2026-10-01T00:00:00.000Z"), // 2 months away -> 20,000 INR/mo
    fundingMode: "manual_envelope",
    priority: 0,
    status: "active",
    startedMinor: 0,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z")
  };

  const goalB: Goal = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: "user-test",
    name: "MacBook Pro",
    targetMinor: 10_000_000, // 100,000 INR
    progressMinor: 4_000_000, // 40,000 INR remaining = 60,000 INR
    targetDate: new Date("2026-12-01T00:00:00.000Z"), // 4 months away -> 15,000 INR/mo
    fundingMode: "manual_envelope",
    priority: 1,
    status: "active",
    startedMinor: 0,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };

  describe("resolveSafetyBufferTarget", () => {
    it("uses 1 month essential outflow as default fallback", () => {
      const resolved = resolveSafetyBufferTarget(null, 5_000_000, 3_000_000);
      expect(resolved.isFallback).toBe(true);
      expect(resolved.targetMinor).toBe(3_000_000);
      expect(resolved.liquidBufferGapMinor).toBe(0);
      expect(resolved.liquidBufferSurplusMinor).toBe(2_000_000);
    });

    it("evaluates fixed_amount mode accurately", () => {
      const pref: SafetyBufferPreference = {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        version: 1,
        mode: "fixed_amount",
        amountMinor: 8_000_000,
        months: null,
        emergencyFundGoalId: null,
        effectiveFrom: new Date("2026-08-01"),
        createdAt: new Date("2026-08-01")
      };
      const resolved = resolveSafetyBufferTarget(pref, 5_000_000, 3_000_000);
      expect(resolved.isFallback).toBe(false);
      expect(resolved.targetMinor).toBe(8_000_000);
      expect(resolved.liquidBufferGapMinor).toBe(3_000_000);
      expect(resolved.liquidBufferSurplusMinor).toBe(0);
    });

    it("evaluates essential_months mode with safe multiplication", () => {
      const pref: SafetyBufferPreference = {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        version: 2,
        mode: "essential_months",
        amountMinor: null,
        months: 3,
        emergencyFundGoalId: null,
        effectiveFrom: new Date("2026-08-01"),
        createdAt: new Date("2026-08-01")
      };
      const resolved = resolveSafetyBufferTarget(pref, 10_000_000, 4_000_000);
      expect(resolved.targetMinor).toBe(12_000_000); // 3 * 4,000,000
      expect(resolved.liquidBufferGapMinor).toBe(2_000_000);
    });
  });

  describe("distributeProportionalRemainder", () => {
    it("distributes exact integer paise without losing or creating money", () => {
      const items = [
        { id: "1", remainingMinor: 100_000, priority: 0 },
        { id: "2", remainingMinor: 200_000, priority: 1 },
        { id: "3", remainingMinor: 300_000, priority: 2 }
      ];
      // total remaining = 600,000
      // Available = 100,001 (not cleanly divisible by 6)
      const shares = distributeProportionalRemainder(100_001, items);

      let sum = 0;
      for (const val of shares.values()) sum += val;
      expect(sum).toBe(100_001);
    });

    it("caps share at remaining goal amount", () => {
      const items = [
        { id: "1", remainingMinor: 5_000, priority: 0 },
        { id: "2", remainingMinor: 10_000, priority: 1 }
      ];
      const shares = distributeProportionalRemainder(100_000, items);
      expect(shares.get("1")).toBe(5_000);
      expect(shares.get("2")).toBe(10_000);
    });
  });

  describe("evaluateScenario", () => {
    it("evaluates Priority Order scenario with water-filling", () => {
      const available = 2_500_000; // 25,000 INR
      // Goal A needs 20,000 INR/mo (remaining 40,000)
      // Goal B needs 15,000 INR/mo (remaining 60,000)
      const scenario = evaluateScenario("priority_order", [goalA, goalB], available, asOf);

      expect(scenario.allocations).toHaveLength(2);
      // Priority 0 gets full required 20,000 INR
      expect(scenario.allocations[0]?.allocatedMonthlyMinor).toBe(2_000_000);
      expect(scenario.allocations[0]?.status).toBe("feasible");

      // Priority 1 gets remaining 5,000 INR
      expect(scenario.allocations[1]?.allocatedMonthlyMinor).toBe(500_000);
      expect(scenario.allocations[1]?.status).toBe("delayed");
      expect(scenario.totalAllocatedMonthlyMinor).toBe(2_500_000);
    });

    it("evaluates Proportional Allocation scenario with integer conservation", () => {
      const available = 2_500_000; // 25,000 INR
      // Goal A remaining = 40,000 INR (40%) -> 10,000 INR
      // Goal B remaining = 60,000 INR (60%) -> 15,000 INR
      const scenario = evaluateScenario("proportional", [goalA, goalB], available, asOf);

      expect(scenario.allocations[0]?.allocatedMonthlyMinor).toBe(1_000_000);
      expect(scenario.allocations[1]?.allocatedMonthlyMinor).toBe(1_500_000);
      expect(scenario.totalAllocatedMonthlyMinor).toBe(2_500_000);
    });
  });

  describe("generateFeasibilityReport", () => {
    it("generates full report with 3 scenarios linked to forecast and safety buffer", () => {
      const report = generateFeasibilityReport({
        goals: [goalA, goalB],
        forecast: dummyForecast,
        safetyBufferPreference: null,
        liquidBalanceMinor: 10_000_000,
        asOf
      });

      expect(report.forecastSnapshotId).toBe(dummyForecast.id);
      expect(report.isForecastSufficient).toBe(true);
      expect(report.isForecastStale).toBe(false);
      expect(report.scenarios).toHaveLength(3);
      expect(report.scenarios.map((s) => s.scenarioType)).toEqual([
        "priority_order",
        "target_date_order",
        "proportional"
      ]);
    });

    it("abstains from positive available contribution when forecast is stale or insufficient", () => {
      const staleForecast: CashflowForecastSnapshot = {
        ...dummyForecast,
        asOf: new Date("2026-07-01T00:00:00.000Z") // >7 days ago
      };

      const report = generateFeasibilityReport({
        goals: [goalA, goalB],
        forecast: staleForecast,
        safetyBufferPreference: null,
        liquidBalanceMinor: 10_000_000,
        asOf
      });

      expect(report.isForecastStale).toBe(true);
      expect(report.conservativeAvailableMonthlyMinor).toBe(0);
      expect(report.scenarios[0]?.allocations[0]?.status).toBe("at_risk");
    });
  });

  describe("calculateProjectedCompletionRange", () => {
    it("computes optimistic, baseline, and pessimistic dates", () => {
      const range = calculateProjectedCompletionRange(6_000_000, 1_000_000, asOf);
      expect(range.baselineDate).toBeDefined();
      expect(range.optimisticDate).toBeDefined();
      expect(range.pessimisticDate).toBeDefined();
      // optimistic date should be sooner than or equal to baseline, which is sooner than pessimistic
      expect(range.optimisticDate?.getTime()).toBeLessThanOrEqual(
        range.baselineDate?.getTime() ?? 0
      );
      expect(range.baselineDate?.getTime()).toBeLessThanOrEqual(
        range.pessimisticDate?.getTime() ?? 0
      );
    });

    it("returns null dates when allocated monthly contribution is 0", () => {
      const range = calculateProjectedCompletionRange(6_000_000, 0, asOf);
      expect(range.optimisticDate).toBeNull();
      expect(range.baselineDate).toBeNull();
      expect(range.pessimisticDate).toBeNull();
    });
  });
});
