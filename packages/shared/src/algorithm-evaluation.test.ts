import { describe, expect, it } from "vitest";

import {
  AlgorithmResourceContractSchema,
  AlgorithmRunContextSchema,
  AlgorithmSufficiencySchema,
  AlgorithmVersionComparisonSchema,
  BinaryDecisionMetricsSchema,
  CategoryDecisionMetricsSchema
} from "./algorithm-evaluation.js";

describe("algorithm evaluation contracts", () => {
  it("accepts a versioned shadow run with bounded resource evidence", () => {
    expect(
      AlgorithmRunContextSchema.parse({
        algorithmKey: "cashflow_forecast",
        algorithmVersion: 2,
        policyVersion: 1,
        rolloutMode: "shadow",
        inputWatermark: "2026-08-01T00:00:00.000Z/txn-100",
        sufficiency: {
          status: "sufficient",
          observationCount: 365,
          minimumRequired: 180
        },
        resources: {
          rowsScanned: 1_200,
          runtimeMs: 480,
          rowBudgetHit: false,
          timedOut: false,
          outcome: { status: "completed" }
        }
      })
    ).toMatchObject({ rolloutMode: "shadow", algorithmVersion: 2 });
  });

  it("bounds worker lookback, rows, transaction batches, runtime, and degraded behavior", () => {
    expect(
      AlgorithmResourceContractSchema.parse({
        lookbackDays: 365,
        maxRows: 10_000,
        batchSize: 200,
        expectedComplexity: "n_log_n",
        timeoutMs: 30_000,
        degradedMode: "return_resource_limit"
      })
    ).toMatchObject({ batchSize: 200, degradedMode: "return_resource_limit" });

    expect(() =>
      AlgorithmResourceContractSchema.parse({
        lookbackDays: 0,
        maxRows: 0,
        batchSize: 201,
        expectedComplexity: "unbounded",
        timeoutMs: 0,
        degradedMode: "truncate"
      })
    ).toThrow();
  });

  it("requires aggregate shadow/canary deltas to be arithmetically honest", () => {
    const comparison = {
      algorithmKey: "recurring_detection",
      rolloutMode: "canary",
      activeVersion: 1,
      candidateVersion: 2,
      completeDecisionWindows: 12,
      metrics: [
        {
          metric: "mature_precision_bps",
          unit: "basis_points",
          activeValue: 8_900,
          candidateValue: 9_250,
          delta: 350
        }
      ]
    };
    expect(AlgorithmVersionComparisonSchema.parse(comparison)).toMatchObject({
      rolloutMode: "canary",
      completeDecisionWindows: 12
    });
    expect(() =>
      AlgorithmVersionComparisonSchema.parse({
        ...comparison,
        metrics: [{ ...comparison.metrics[0], delta: 351 }]
      })
    ).toThrow("delta must equal candidateValue minus activeValue");
  });

  it("represents abstention precision separately from coverage", () => {
    expect(
      CategoryDecisionMetricsSchema.parse({
        eligibleCount: 20,
        predictedCount: 0,
        correctCount: 0,
        top1PrecisionBps: null,
        coverageBps: 0,
        amountWeightedAccuracyBps: 0
      })
    ).toMatchObject({ top1PrecisionBps: null, coverageBps: 0 });
  });

  it("rejects internally inconsistent sufficiency and metric counts", () => {
    expect(() =>
      AlgorithmSufficiencySchema.parse({
        status: "sufficient",
        observationCount: 2,
        minimumRequired: 3
      })
    ).toThrow("must meet minimumRequired");
    expect(() =>
      BinaryDecisionMetricsSchema.parse({
        observationCount: 2,
        truePositiveCount: 1,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        trueNegativeCount: 0,
        precisionBps: 10_000,
        recallBps: 10_000
      })
    ).toThrow("must sum to observationCount");
    expect(() =>
      CategoryDecisionMetricsSchema.parse({
        eligibleCount: 1,
        predictedCount: 2,
        correctCount: 2,
        top1PrecisionBps: 10_000,
        coverageBps: 10_000,
        amountWeightedAccuracyBps: 10_000
      })
    ).toThrow("must not exceed eligibleCount");
  });
});
