import { describe, expect, it } from "vitest";

import {
  DetectedRecurringStreamChangeSchema,
  RecurringAmountChangeEvidenceSchema,
  SpendingChangeInputWatermarkSchema,
  SpendingChangePromotionDecisionSchema,
  SpendingRegimeSchema
} from "./spending-change-detection.js";

describe("spending-change-detection schemas", () => {
  const dummyWatermark = {
    asOf: new Date("2026-08-01T00:00:00.000Z"),
    latestOccurredAt: new Date("2026-07-31T12:00:00.000Z"),
    latestUpdatedAt: new Date("2026-07-31T12:00:00.000Z"),
    lastTransactionId: "11111111-1111-4111-8111-111111111111",
    rowCount: 50,
    digest: "a".repeat(64)
  };

  it("validates input watermark schema", () => {
    expect(SpendingChangeInputWatermarkSchema.parse(dummyWatermark)).toBeDefined();
  });

  const dummyCusumState = {
    index: 0,
    amountMinor: 50_000,
    deviationMinor: 10_000,
    upperMinor: 5_000,
    lowerMinor: 0,
    upperTriggered: false,
    lowerTriggered: false
  };

  it("validates recurring amount change evidence and finding", () => {
    const evidence = {
      baselineMedianMinor: 50_000,
      baselineMadMinor: 1_000,
      newMedianMinor: 65_000,
      newMadMinor: 1_200,
      deltaMinor: 15_000,
      deltaBps: 3_000,
      direction: "increase" as const,
      confidenceBps: 9_200,
      preShiftCount: 6,
      postShiftCount: 3,
      persistenceCount: 3,
      changeOccurredAt: new Date("2026-06-01T00:00:00.000Z"),
      changeTransactionId: "22222222-2222-4222-8222-222222222222",
      referenceAllowanceMinor: 500,
      decisionThresholdMinor: 4_000,
      cusumStates: [dummyCusumState],
      detectorVersion: 1
    };

    expect(RecurringAmountChangeEvidenceSchema.parse(evidence)).toBeDefined();

    const finding = {
      id: "33333333-3333-4333-8333-333333333333",
      userId: "user-123",
      streamId: "44444444-4444-4444-8444-444444444444",
      supersedesStreamId: null,
      oldMedianMinor: 50_000,
      newMedianMinor: 65_000,
      deltaMinor: 15_000,
      direction: "increase" as const,
      confidenceBps: 9_200,
      changeOccurredAt: new Date("2026-06-01T00:00:00.000Z"),
      changeTransactionId: "22222222-2222-4222-8222-222222222222",
      evidence,
      inputWatermark: dummyWatermark,
      detectorVersion: 1,
      computedAt: new Date("2026-08-01T00:00:00.000Z")
    };

    expect(DetectedRecurringStreamChangeSchema.parse(finding)).toBeDefined();
  });

  it("validates spending regime schema", () => {
    const regime = {
      id: "55555555-5555-4555-8555-555555555555",
      userId: "user-123",
      regimeType: "variable_spending" as const,
      baselineMedianMinor: 300_000,
      newMedianMinor: 450_000,
      deltaMinor: 150_000,
      direction: "increase" as const,
      confidenceBps: 8_500,
      sufficiency: {
        status: "sufficient" as const,
        observationCount: 16,
        minimumRequired: 8
      },
      changeDate: "2026-06-01",
      occurredAtStart: new Date("2026-01-01T00:00:00.000Z"),
      occurredAtEnd: new Date("2026-07-31T00:00:00.000Z"),
      evidence: {
        baselineMedianMinor: 300_000,
        baselineMadMinor: 20_000,
        newMedianMinor: 450_000,
        newMadMinor: 25_000,
        deltaMinor: 150_000,
        deltaBps: 5_000,
        direction: "increase" as const,
        confidenceBps: 8_500,
        baselinePeriods: 10,
        postShiftPeriods: 6,
        persistencePeriods: 4,
        referenceAllowanceMinor: 10_000,
        decisionThresholdMinor: 80_000,
        periodUnit: "weekly" as const,
        cusumStates: [dummyCusumState],
        detectorVersion: 1
      },
      inputWatermark: dummyWatermark,
      supersedesRegimeId: null,
      detectorVersion: 1,
      computedAt: new Date("2026-08-01T00:00:00.000Z")
    };

    expect(SpendingRegimeSchema.parse(regime)).toBeDefined();
  });

  it("validates promotion decision", () => {
    const decision = {
      activeVersion: 1,
      candidateVersion: 2,
      eligible: true,
      reasons: ["precision above threshold", "lower false change rate"],
      metrics: {
        changeDecision: {
          observationCount: 100,
          truePositiveCount: 90,
          falsePositiveCount: 5,
          trueNegativeCount: 0,
          falseNegativeCount: 5,
          precisionBps: 9_473,
          recallBps: 9_473,
          f1ScoreBps: 9_473
        },
        meanLagDays: 4,
        meanMagnitudeErrorMinor: 500,
        falseChangePointRateBps: 500
      }
    };

    expect(SpendingChangePromotionDecisionSchema.parse(decision)).toBeDefined();
  });
});
