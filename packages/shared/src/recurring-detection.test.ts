import { describe, expect, it } from "vitest";

import {
  DetectedRecurringStreamSchema,
  RecurringDetectionPromotionDecisionSchema,
  RecurringDetectionRunResultSchema
} from "./recurring-detection.js";

const emptyMetrics = {
  matureStreamDecision: {
    observationCount: 0,
    truePositiveCount: 0,
    falsePositiveCount: 0,
    falseNegativeCount: 0,
    trueNegativeCount: 0,
    precisionBps: null,
    recallBps: null
  },
  nextDateMaeDays: null,
  nextAmountMaeMinor: null,
  missedPaymentMeanLeadDays: null,
  acceptedCount: 0,
  rejectedCount: 0,
  unreviewedCount: 0,
  acceptanceRateBps: null,
  rejectionRateBps: null
} as const;

describe("recurring detection contracts", () => {
  it("validates versioned immutable stream evidence and watermarks", () => {
    const parsed = DetectedRecurringStreamSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "user-a",
      logicalKey: "a".repeat(64),
      fingerprint: "b".repeat(64),
      detectorVersion: 1,
      transactionType: "expense",
      counterpartyKey: "acme",
      cadence: "monthly",
      state: "mature",
      amountBehavior: "fixed",
      confidenceBps: 9_000,
      sufficiency: { status: "sufficient", observationCount: 3, minimumRequired: 2 },
      evidence: {
        cadenceScore: {
          coverageBps: 10_000,
          dateStabilityBps: 10_000,
          amountStabilityBps: 10_000,
          textStabilityBps: 10_000,
          missPenaltyBps: 0,
          cadenceMarginBps: 2_000,
          expectedSlotCount: 3,
          matchedSlotCount: 3,
          recentMissCount: 0
        },
        confidenceBps: 9_000,
        medianAmountMinor: 100_000,
        madAmountMinor: 0,
        intervalMedianDays: 31,
        intervalMadDays: 1,
        memberCount: 3,
        observationSpanDays: 59,
        normalizerVersion: 1,
        scoringPolicyVersion: 1
      },
      medianAmountMinor: 100_000,
      madAmountMinor: 0,
      nextExpectedDate: "2026-04-01",
      inputWatermark: {
        asOf: "2026-03-01T12:00:00.000Z",
        latestOccurredAt: "2026-03-01T12:00:00.000Z",
        latestUpdatedAt: "2026-03-01T12:00:00.000Z",
        lastTransactionId: "00000000-0000-4000-8000-000000000003",
        rowCount: 3,
        digest: "c".repeat(64)
      },
      supersedesStreamId: null,
      computedAt: "2026-03-01T12:00:00.000Z"
    });
    expect(parsed.inputWatermark.asOf).toBeInstanceOf(Date);
  });

  it("rejects invalid resource and promotion counts", () => {
    expect(() =>
      RecurringDetectionRunResultSchema.parse({
        id: "00000000-0000-4000-8000-000000000001",
        detectorVersion: 1,
        status: "completed",
        asOf: new Date(),
        inputWatermark: {
          asOf: new Date(),
          latestOccurredAt: null,
          latestUpdatedAt: null,
          lastTransactionId: null,
          rowCount: 0,
          digest: "d".repeat(64)
        },
        sufficiency: {
          status: "insufficient",
          reason: "insufficient_history",
          observationCount: 0,
          minimumRequired: 2
        },
        resources: {
          rowsScanned: -1,
          runtimeMs: 0,
          rowBudgetHit: false,
          timedOut: false,
          outcome: { status: "completed" }
        },
        candidateCount: 0,
        matureCount: 0,
        staleCount: 0,
        abstainedGroupCount: 0,
        processedStreamCount: 0,
        totalStreamCount: 0,
        startedAt: new Date(),
        completedAt: new Date()
      })
    ).toThrow();
    expect(() =>
      RecurringDetectionPromotionDecisionSchema.parse({
        detectorVersion: 1,
        eligible: false,
        completeDecisionWindows: -1,
        minimumDecisionWindows: 4,
        candidateMetrics: emptyMetrics,
        baselineMetrics: emptyMetrics,
        reason: "insufficient_windows"
      })
    ).toThrow();
  });
});
