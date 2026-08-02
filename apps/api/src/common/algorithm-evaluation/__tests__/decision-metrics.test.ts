import { describe, expect, it } from "vitest";

import {
  calculateBinaryDecisionMetrics,
  calculateBudgetDecisionMetrics,
  calculateCategoryDecisionMetrics,
  calculateForecastDecisionMetrics,
  calculateRecurrenceDecisionMetrics,
  calculateShortfallDecisionMetrics,
  calculateWarningDecisionMetrics
} from "../decision-metrics.js";

describe("decision-oriented evaluation metrics", () => {
  it("reports binary precision and recall with null denominators", () => {
    expect(
      calculateBinaryDecisionMetrics([
        { actual: true, predicted: true },
        { actual: false, predicted: true },
        { actual: true, predicted: false },
        { actual: false, predicted: false }
      ])
    ).toEqual({
      observationCount: 4,
      truePositiveCount: 1,
      falsePositiveCount: 1,
      falseNegativeCount: 1,
      trueNegativeCount: 1,
      precisionBps: 5_000,
      recallBps: 5_000
    });
    expect(calculateBinaryDecisionMetrics([])).toMatchObject({
      precisionBps: null,
      recallBps: null
    });
  });

  it("keeps category precision, coverage, and amount-weighted accuracy distinct", () => {
    expect(
      calculateCategoryDecisionMetrics([
        { actualLabel: "food", predictedLabel: "food", amountMinor: 100 },
        { actualLabel: "travel", predictedLabel: null, amountMinor: 100 },
        { actualLabel: "rent", predictedLabel: "shopping", amountMinor: 800 }
      ])
    ).toEqual({
      eligibleCount: 3,
      predictedCount: 2,
      correctCount: 1,
      top1PrecisionBps: 5_000,
      coverageBps: 6_667,
      amountWeightedAccuracyBps: 1_000
    });
    expect(calculateCategoryDecisionMetrics([])).toEqual({
      eligibleCount: 0,
      predictedCount: 0,
      correctCount: 0,
      top1PrecisionBps: null,
      coverageBps: 0,
      amountWeightedAccuracyBps: null
    });
    expect(
      calculateCategoryDecisionMetrics([
        {
          actualLabel: "income",
          predictedLabel: "income",
          amountMinor: Number.MAX_SAFE_INTEGER
        },
        {
          actualLabel: "expense",
          predictedLabel: "income",
          amountMinor: Number.MAX_SAFE_INTEGER
        }
      ]).amountWeightedAccuracyBps
    ).toBe(5_000);
  });

  it("evaluates forecast error against a baseline, events, and empirical ranges", () => {
    expect(
      calculateForecastDecisionMetrics([
        {
          actualMinor: 100,
          predictedMinor: 90,
          baselinePredictedMinor: 80,
          lowerMinor: 80,
          upperMinor: 120
        },
        {
          actualMinor: 0,
          predictedMinor: 10,
          baselinePredictedMinor: 0,
          lowerMinor: 0,
          upperMinor: 20
        },
        {
          actualMinor: 50,
          predictedMinor: 70,
          baselinePredictedMinor: 100,
          lowerMinor: 60,
          upperMinor: 80
        }
      ])
    ).toEqual({
      observationCount: 3,
      maeMinor: 13,
      baselineMaeMinor: 23,
      maseBps: 5_652,
      eventOccurrence: {
        observationCount: 3,
        truePositiveCount: 2,
        falsePositiveCount: 1,
        falseNegativeCount: 0,
        trueNegativeCount: 0,
        precisionBps: 6_667,
        recallBps: 10_000
      },
      intervalCoverageBps: 6_667,
      meanIntervalWidthMinor: 27
    });

    expect(
      calculateForecastDecisionMetrics([
        {
          actualMinor: 100,
          predictedMinor: 90,
          baselinePredictedMinor: 100,
          lowerMinor: 80,
          upperMinor: 120
        }
      ]).maseBps
    ).toBeNull();
    expect(calculateForecastDecisionMetrics([])).toEqual({
      observationCount: 0,
      maeMinor: null,
      baselineMaeMinor: null,
      maseBps: null,
      eventOccurrence: {
        observationCount: 0,
        truePositiveCount: 0,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        trueNegativeCount: 0,
        precisionBps: null,
        recallBps: null
      },
      intervalCoverageBps: null,
      meanIntervalWidthMinor: null
    });
  });

  it("scores mature recurrence and next-event accuracy", () => {
    expect(
      calculateRecurrenceDecisionMetrics([
        {
          actualMature: true,
          predictedMature: true,
          actualNextDate: "2026-08-10",
          predictedNextDate: "2026-08-12",
          actualNextAmountMinor: 100_000,
          predictedNextAmountMinor: 110_000,
          missedPaymentLeadDays: 3,
          reviewOutcome: "accepted"
        },
        {
          actualMature: false,
          predictedMature: true,
          actualNextDate: null,
          predictedNextDate: "2026-09-01",
          actualNextAmountMinor: null,
          predictedNextAmountMinor: 50_000,
          missedPaymentLeadDays: null,
          reviewOutcome: "rejected"
        },
        {
          actualMature: true,
          predictedMature: false,
          actualNextDate: "2026-09-20",
          predictedNextDate: "2026-09-18",
          actualNextAmountMinor: 200_000,
          predictedNextAmountMinor: 190_000,
          missedPaymentLeadDays: 5,
          reviewOutcome: "unreviewed"
        }
      ])
    ).toEqual({
      matureStreamDecision: {
        observationCount: 3,
        truePositiveCount: 1,
        falsePositiveCount: 1,
        falseNegativeCount: 1,
        trueNegativeCount: 0,
        precisionBps: 5_000,
        recallBps: 5_000
      },
      nextDateMaeDays: 2,
      nextAmountMaeMinor: 10_000,
      missedPaymentMeanLeadDays: 4,
      acceptedCount: 1,
      rejectedCount: 1,
      unreviewedCount: 1,
      acceptanceRateBps: 5_000,
      rejectionRateBps: 5_000
    });
  });

  it("scores shortfall decisions, warning lead, and first-date error", () => {
    expect(
      calculateShortfallDecisionMetrics([
        {
          decisionDate: "2026-08-01",
          actualFirstShortfallDate: "2026-08-10",
          predictedFirstShortfallDate: "2026-08-12"
        },
        {
          decisionDate: "2026-08-01",
          actualFirstShortfallDate: "2026-08-20",
          predictedFirstShortfallDate: null
        },
        {
          decisionDate: "2026-08-01",
          actualFirstShortfallDate: null,
          predictedFirstShortfallDate: "2026-08-15"
        }
      ])
    ).toEqual({
      shortfallDecision: {
        observationCount: 3,
        truePositiveCount: 1,
        falsePositiveCount: 1,
        falseNegativeCount: 1,
        trueNegativeCount: 0,
        precisionBps: 5_000,
        recallBps: 5_000
      },
      meanWarningLeadDays: 9,
      firstShortfallDateMaeDays: 2
    });
  });

  it("separates useful budget lead time from warnings emitted after breach", () => {
    expect(
      calculateBudgetDecisionMetrics([
        { actualBreach: true, predictedBreach: true, warningLeadDays: 8 },
        { actualBreach: true, predictedBreach: true, warningLeadDays: -2 },
        { actualBreach: false, predictedBreach: true, warningLeadDays: null },
        { actualBreach: true, predictedBreach: false, warningLeadDays: null }
      ])
    ).toEqual({
      breachDecision: {
        observationCount: 4,
        truePositiveCount: 2,
        falsePositiveCount: 1,
        falseNegativeCount: 1,
        trueNegativeCount: 0,
        precisionBps: 6_667,
        recallBps: 6_667
      },
      meanWarningLeadDays: 8,
      postBreachWarningCount: 1
    });
  });

  it("reports warning usefulness, dismissals, unresolved outcomes, and amount at risk", () => {
    expect(
      calculateWarningDecisionMetrics([
        { outcome: "confirmed", amountAtRiskMinor: 100_000 },
        { outcome: "dismissed", amountAtRiskMinor: 20_000 },
        { outcome: "unresolved", amountAtRiskMinor: 30_000 }
      ])
    ).toEqual({
      warningCount: 3,
      confirmedCount: 1,
      dismissedCount: 1,
      unresolvedCount: 1,
      confirmedUsefulnessBps: 5_000,
      dismissRateBps: 5_000,
      totalAmountAtRiskMinor: 150_000
    });
  });

  it("rejects invalid money, dates, ranges, and misleading lead-time inputs", () => {
    expect(() =>
      calculateCategoryDecisionMetrics([{ actualLabel: "", predictedLabel: null, amountMinor: 1 }])
    ).toThrow("actualLabel");
    expect(() =>
      calculateCategoryDecisionMetrics([
        { actualLabel: "food", predictedLabel: "", amountMinor: 1 }
      ])
    ).toThrow("predictedLabel");
    expect(() =>
      calculateCategoryDecisionMetrics([
        { actualLabel: "food", predictedLabel: null, amountMinor: -1 }
      ])
    ).toThrow("non-negative");
    expect(() =>
      calculateForecastDecisionMetrics([
        {
          actualMinor: 1,
          predictedMinor: 1,
          baselinePredictedMinor: 1,
          lowerMinor: 2,
          upperMinor: 1
        }
      ])
    ).toThrow("lowerMinor");
    expect(() =>
      calculateShortfallDecisionMetrics([
        {
          decisionDate: "2026-08-20",
          actualFirstShortfallDate: "2026-08-10",
          predictedFirstShortfallDate: "2026-08-10"
        }
      ])
    ).toThrow("must not follow");
    expect(() =>
      calculateShortfallDecisionMetrics([
        {
          decisionDate: "2026/08/01",
          actualFirstShortfallDate: null,
          predictedFirstShortfallDate: null
        }
      ])
    ).toThrow("YYYY-MM-DD");
    expect(() =>
      calculateShortfallDecisionMetrics([
        {
          decisionDate: "2026-02-30",
          actualFirstShortfallDate: null,
          predictedFirstShortfallDate: null
        }
      ])
    ).toThrow("valid calendar date");
    expect(() =>
      calculateBudgetDecisionMetrics([
        { actualBreach: false, predictedBreach: true, warningLeadDays: 2 }
      ])
    ).toThrow("requires an actual and predicted breach");
    expect(() =>
      calculateWarningDecisionMetrics([
        { outcome: "confirmed", amountAtRiskMinor: Number.MAX_SAFE_INTEGER },
        { outcome: "confirmed", amountAtRiskMinor: 1 }
      ])
    ).toThrow("safe integer range");
  });
});
