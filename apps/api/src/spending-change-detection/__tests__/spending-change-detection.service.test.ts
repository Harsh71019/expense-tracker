import { describe, expect, it, vi } from "vitest";
import type { SpendingChangeDetectionRunResult } from "@treasury-ops/shared";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { SpendingChangeDetectionService } from "../spending-change-detection.service.js";
import { SpendingChangeDetectionRepository } from "../spending-change-detection.repository.js";
import { MetricsService } from "../../common/observability/metrics.service.js";

describe("SpendingChangeDetectionService", () => {
  const userId = "srv-user-01";
  const asOf = new Date("2026-08-01T00:00:00.000Z");

  it("returns cached result if run was already final", async () => {
    const mockResult: SpendingChangeDetectionRunResult = {
      id: "run-001",
      detectorVersion: 1,
      asOf,
      status: "completed",
      recurringChangesCount: 1,
      regimesCount: 0,
      abstainedCount: 0,
      startedAt: new Date("2026-08-01T00:00:00.000Z"),
      completedAt: new Date("2026-08-01T00:00:01.000Z"),
      inputWatermark: {
        asOf,
        latestOccurredAt: null,
        latestUpdatedAt: null,
        lastTransactionId: null,
        rowCount: 0,
        digest: "a".repeat(64)
      },
      sufficiency: { status: "sufficient", observationCount: 20, minimumRequired: 10 },
      resources: {
        rowsScanned: 20,
        runtimeMs: 50,
        rowBudgetHit: false,
        timedOut: false,
        outcome: { status: "completed" }
      }
    };

    const mockRepo = {
      findBoundedHistory: vi.fn(async () => ({ rows: [], rowBudgetHit: false })),
      findMatureStreams: vi.fn(async () => []),
      beginOrResumeRun: vi.fn(async () => ({ alreadyFinal: true, result: mockResult })),
      persistDerivedStreamChanges: vi.fn(async () => undefined),
      persistSpendingRegimes: vi.fn(async () => undefined),
      completeRun: vi.fn(async () => mockResult),
      markRunFailed: vi.fn(async () => undefined)
    };

    const mockMetrics = {
      recordSpendingChangeDetectionRun: vi.fn(async () => undefined)
    };

    const service = new SpendingChangeDetectionService(
      focusedTestDouble<SpendingChangeDetectionRepository>(mockRepo),
      focusedTestDouble<MetricsService>(mockMetrics)
    );

    const result = await service.analyzeUser(userId, asOf);
    expect(result).toEqual(mockResult);
    expect(mockRepo.persistDerivedStreamChanges).not.toHaveBeenCalled();
    expect(mockRepo.completeRun).not.toHaveBeenCalled();
  });

  it("persists changes, completes run, and records metrics", async () => {
    const mockRun: SpendingChangeDetectionRunResult = {
      id: "run-002",
      detectorVersion: 1,
      asOf,
      status: "completed",
      recurringChangesCount: 0,
      regimesCount: 0,
      abstainedCount: 1,
      startedAt: new Date("2026-08-01T00:00:00.000Z"),
      completedAt: new Date("2026-08-01T00:00:01.000Z"),
      inputWatermark: {
        asOf,
        latestOccurredAt: null,
        latestUpdatedAt: null,
        lastTransactionId: null,
        rowCount: 0,
        digest: "b".repeat(64)
      },
      sufficiency: {
        status: "insufficient",
        reason: "insufficient_history",
        observationCount: 0,
        minimumRequired: 10
      },
      resources: {
        rowsScanned: 0,
        runtimeMs: 10,
        rowBudgetHit: false,
        timedOut: false,
        outcome: { status: "abstained", reason: "insufficient_history" }
      }
    };

    const mockRepo = {
      findBoundedHistory: vi.fn(async () => ({ rows: [], rowBudgetHit: false })),
      findMatureStreams: vi.fn(async () => []),
      beginOrResumeRun: vi.fn(async () => ({
        alreadyFinal: false,
        result: { ...mockRun, status: "running" as const }
      })),
      persistDerivedStreamChanges: vi.fn(async () => undefined),
      persistSpendingRegimes: vi.fn(async () => undefined),
      completeRun: vi.fn(async () => mockRun),
      markRunFailed: vi.fn(async () => undefined)
    };

    const mockMetrics = {
      recordSpendingChangeDetectionRun: vi.fn(async () => undefined)
    };

    const service = new SpendingChangeDetectionService(
      focusedTestDouble<SpendingChangeDetectionRepository>(mockRepo),
      focusedTestDouble<MetricsService>(mockMetrics)
    );

    const result = await service.analyzeUser(userId, asOf);
    expect(result.status).toBe("completed");
    expect(mockRepo.persistDerivedStreamChanges).toHaveBeenCalled();
    expect(mockRepo.persistSpendingRegimes).toHaveBeenCalled();
    expect(mockRepo.completeRun).toHaveBeenCalled();
    expect(mockMetrics.recordSpendingChangeDetectionRun).toHaveBeenCalledWith(
      "completed",
      0,
      0,
      1,
      expect.any(Object)
    );
  });

  it("marks run failed and rethrows on unexpected error", async () => {
    const mockRepo = {
      findBoundedHistory: vi.fn(async () => ({ rows: [], rowBudgetHit: false })),
      findMatureStreams: vi.fn(async () => []),
      beginOrResumeRun: vi.fn(async () => ({
        alreadyFinal: false,
        result: {
          id: "run-003",
          detectorVersion: 1,
          asOf,
          status: "running" as const,
          recurringChangesCount: 0,
          regimesCount: 0,
          abstainedCount: 0,
          startedAt: new Date(),
          completedAt: null,
          inputWatermark: {
            asOf,
            latestOccurredAt: null,
            latestUpdatedAt: null,
            lastTransactionId: null,
            rowCount: 0,
            digest: "c".repeat(64)
          },
          sufficiency: { status: "sufficient" as const, observationCount: 1, minimumRequired: 1 },
          resources: {
            rowsScanned: 0,
            runtimeMs: 0,
            rowBudgetHit: false,
            timedOut: false,
            outcome: { status: "completed" as const }
          }
        }
      })),
      persistDerivedStreamChanges: vi.fn(async () => {
        throw new Error("DB connection lost");
      }),
      markRunFailed: vi.fn(async () => undefined)
    };

    const mockMetrics = {
      recordSpendingChangeDetectionRun: vi.fn(async () => undefined)
    };

    const service = new SpendingChangeDetectionService(
      focusedTestDouble<SpendingChangeDetectionRepository>(mockRepo),
      focusedTestDouble<MetricsService>(mockMetrics)
    );

    await expect(service.analyzeUser(userId, asOf)).rejects.toThrow("DB connection lost");
    expect(mockRepo.markRunFailed).toHaveBeenCalledWith(userId, "run-003", "runtime_error");
    expect(mockMetrics.recordSpendingChangeDetectionRun).toHaveBeenCalledWith(
      "failed",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Object)
    );
  });
});
