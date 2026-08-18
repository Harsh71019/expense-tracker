import { describe, expect, it } from "vitest";

import { calculateEssentialBurn, type MonthlyLedgerExpenseFacts } from "../essential-burn.js";

describe("calculateEssentialBurn (Pure Calculator)", () => {
  const asOf = new Date("2026-08-18T10:00:00.000Z");
  const computedAt = new Date("2026-08-18T10:00:00.000Z");
  const candidateMonths = ["2026-05", "2026-06", "2026-07"] as const;
  const currentMonth = "2026-08" as const;

  it("returns unavailable and null average when there are 0 observed complete months", () => {
    const facts = new Map<string, MonthlyLedgerExpenseFacts>();

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.quality).toBe("unavailable");
    expect(result.averageMonthlyEssentialMinor).toBeNull();
    expect(result.observedCompleteMonthCount).toBe(0);
    expect(result.requiredCompleteMonths).toBe(3);
    expect(result.limitations).toContain("no_history");
    expect(result.completeMonths).toEqual([
      {
        month: "2026-05",
        observation: "missing_history",
        essentialTotalMinor: 0,
        eligibleExpenseTransactionCount: 0,
        essentialTransactionCount: 0
      },
      {
        month: "2026-06",
        observation: "missing_history",
        essentialTotalMinor: 0,
        eligibleExpenseTransactionCount: 0,
        essentialTransactionCount: 0
      },
      {
        month: "2026-07",
        observation: "missing_history",
        essentialTotalMinor: 0,
        eligibleExpenseTransactionCount: 0,
        essentialTransactionCount: 0
      }
    ]);
  });

  it("returns limited quality and single-month average when 1 month is observed", () => {
    const facts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-07",
        {
          month: "2026-07",
          eligibleExpenseCount: 5,
          totalExpenseMinor: 40_000,
          essentialCount: 3,
          essentialMinor: 30_000,
          lifestyleCount: 2,
          lifestyleMinor: 10_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ]
    ]);

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.quality).toBe("limited");
    expect(result.observedCompleteMonthCount).toBe(1);
    expect(result.averageMonthlyEssentialMinor).toBe(30_000);
    expect(result.limitations).toContain("insufficient_history");
    expect(result.completeMonths[0]?.observation).toBe("missing_history");
    expect(result.completeMonths[1]?.observation).toBe("missing_history");
    expect(result.completeMonths[2]?.observation).toBe("observed");
  });

  it("returns limited quality and 2-month average with half-up rounding when 2 months are observed", () => {
    const facts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-05",
        {
          month: "2026-05",
          eligibleExpenseCount: 4,
          totalExpenseMinor: 25_000,
          essentialCount: 2,
          essentialMinor: 15_001,
          lifestyleCount: 2,
          lifestyleMinor: 10_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-07",
        {
          month: "2026-07",
          eligibleExpenseCount: 6,
          totalExpenseMinor: 35_000,
          essentialCount: 4,
          essentialMinor: 25_000,
          lifestyleCount: 2,
          lifestyleMinor: 10_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ]
    ]);

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.quality).toBe("limited");
    expect(result.observedCompleteMonthCount).toBe(2);
    // Total essential = 15001 + 25000 = 40001
    // (40001 + 1) / 2 = 40002 / 2 = 20001
    expect(result.averageMonthlyEssentialMinor).toBe(20_001);
  });

  it("returns complete quality and 3-month average when all 3 candidate months are observed", () => {
    const facts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-05",
        {
          month: "2026-05",
          eligibleExpenseCount: 10,
          totalExpenseMinor: 100_000,
          essentialCount: 5,
          essentialMinor: 60_000,
          lifestyleCount: 5,
          lifestyleMinor: 40_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-06",
        {
          month: "2026-06",
          eligibleExpenseCount: 12,
          totalExpenseMinor: 120_000,
          essentialCount: 6,
          essentialMinor: 70_000,
          lifestyleCount: 6,
          lifestyleMinor: 50_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-07",
        {
          month: "2026-07",
          eligibleExpenseCount: 8,
          totalExpenseMinor: 90_000,
          essentialCount: 4,
          essentialMinor: 50_000,
          lifestyleCount: 4,
          lifestyleMinor: 40_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ]
    ]);

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.quality).toBe("complete");
    expect(result.observedCompleteMonthCount).toBe(3);
    // (60000 + 70000 + 50000) / 3 = 180000 / 3 = 60000
    expect(result.averageMonthlyEssentialMinor).toBe(60_000);
    expect(result.limitations).not.toContain("insufficient_history");
    expect(result.limitations).not.toContain("no_history");
  });

  it("treats an observed month with zero essential spend as a valid 0-paise observation", () => {
    // 2026-05: ₹300 essential
    // 2026-06: ₹0 essential (but has ₹200 lifestyle spend) -> OBSERVED
    // 2026-07: ₹300 essential
    const facts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-05",
        {
          month: "2026-05",
          eligibleExpenseCount: 2,
          totalExpenseMinor: 30_000,
          essentialCount: 2,
          essentialMinor: 30_000,
          lifestyleCount: 0,
          lifestyleMinor: 0,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-06",
        {
          month: "2026-06",
          eligibleExpenseCount: 3,
          totalExpenseMinor: 20_000,
          essentialCount: 0,
          essentialMinor: 0,
          lifestyleCount: 3,
          lifestyleMinor: 20_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-07",
        {
          month: "2026-07",
          eligibleExpenseCount: 2,
          totalExpenseMinor: 30_000,
          essentialCount: 2,
          essentialMinor: 30_000,
          lifestyleCount: 0,
          lifestyleMinor: 0,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ]
    ]);

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.quality).toBe("complete");
    expect(result.observedCompleteMonthCount).toBe(3);
    expect(result.completeMonths[1]?.observation).toBe("observed");
    expect(result.completeMonths[1]?.essentialTotalMinor).toBe(0);
    // (30000 + 0 + 30000) / 3 = 60000 / 3 = 20000
    expect(result.averageMonthlyEssentialMinor).toBe(20_000);
  });

  it("never mixes current partial month into the baseline average", () => {
    const facts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-07",
        {
          month: "2026-07",
          eligibleExpenseCount: 4,
          totalExpenseMinor: 10_000,
          essentialCount: 4,
          essentialMinor: 10_000,
          lifestyleCount: 0,
          lifestyleMinor: 0,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-08",
        {
          month: "2026-08",
          eligibleExpenseCount: 10,
          totalExpenseMinor: 999_999,
          essentialCount: 10,
          essentialMinor: 999_999,
          lifestyleCount: 0,
          lifestyleMinor: 0,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ]
    ]);

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.averageMonthlyEssentialMinor).toBe(10_000); // exactly from 2026-07
    expect(result.currentPartialMonth).toEqual({
      month: "2026-08",
      essentialTotalMinor: 999_999,
      eligibleExpenseTransactionCount: 10,
      essentialTransactionCount: 10,
      excludedFromBaseline: true
    });
  });

  it("detects uncategorized and ungrouped expenses and sets classification evidence and limitation keys", () => {
    const facts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-05",
        {
          month: "2026-05",
          eligibleExpenseCount: 10,
          totalExpenseMinor: 100_000,
          essentialCount: 5,
          essentialMinor: 50_000,
          lifestyleCount: 3,
          lifestyleMinor: 30_000,
          uncategorizedCount: 1,
          uncategorizedMinor: 15_000,
          ungroupedCount: 1,
          ungroupedMinor: 5_000
        }
      ]
    ]);

    const result = calculateEssentialBurn({
      asOf,
      computedAt,
      candidateMonths,
      currentMonth,
      monthlyFacts: facts
    });

    expect(result.limitations).toContain("uncategorized_expenses_present");
    expect(result.limitations).toContain("ungrouped_categories_present");
    expect(result.classification).toEqual({
      eligibleExpenseTransactionCount: 10,
      essentialExpenseTransactionCount: 5,
      lifestyleExpenseTransactionCount: 3,
      uncategorizedExpenseCount: 1,
      uncategorizedExpenseMinor: 15_000,
      ungroupedExpenseCount: 1,
      ungroupedExpenseMinor: 5_000,
      categorizedExpenseMinor: 80_000,
      unclassifiedExpenseMinor: 20_000,
      coverageRatioBps: 8000,
      currentCategoryMetadataInUse: true
    });
  });
});
