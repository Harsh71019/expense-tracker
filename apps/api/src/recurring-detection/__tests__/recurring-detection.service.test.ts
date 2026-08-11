import type { RecurringDetectionRunResult } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";
import { MetricsService } from "../../common/observability/metrics.service.js";
import { RedisService } from "../../common/redis/redis.service.js";
import {
  RecurringDetectionJobDataSchema,
  RecurringDetectionQueue
} from "../recurring-detection.queue.js";
import { RecurringDetectionRepository } from "../recurring-detection.repository.js";
import { RecurringDetectionScheduleService } from "../recurring-detection-schedule.service.js";
import { RecurringDetectionService } from "../recurring-detection.service.js";

const AS_OF = new Date("2026-03-01T12:00:00.000Z");

describe("RecurringDetectionService", () => {
  it("persists the pure result then completes the resumable run", async () => {
    const repository = repositoryDouble();
    const metrics = metricsService();
    const record = vi.spyOn(metrics, "recordRecurringDetectionRun");
    const service = new RecurringDetectionService(
      focusedTestDouble<RecurringDetectionRepository>(repository),
      metrics
    );

    await expect(service.analyzeUser("user-a", AS_OF)).resolves.toMatchObject({
      status: "completed",
      totalStreamCount: 1
    });
    expect(repository.persistStreamRevision).toHaveBeenCalledTimes(1);
    expect(repository.completeRun).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("completed", 1, 0, completedRun().resources);
  });

  it("returns a completed idempotent run without rewriting its snapshot", async () => {
    const repository = repositoryDouble();
    repository.beginOrResumeRun.mockResolvedValue({
      result: completedRun(),
      alreadyFinal: true
    });
    const service = new RecurringDetectionService(
      focusedTestDouble<RecurringDetectionRepository>(repository),
      metricsService()
    );

    await service.analyzeUser("user-a", AS_OF);

    expect(repository.persistStreamRevision).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("marks a claimed run failed with a low-cardinality code", async () => {
    const repository = repositoryDouble();
    repository.persistStreamRevision.mockRejectedValue(new Error("database unavailable"));
    const service = new RecurringDetectionService(
      focusedTestDouble<RecurringDetectionRepository>(repository),
      metricsService()
    );

    await expect(service.analyzeUser("user-a", AS_OF)).rejects.toThrow("database unavailable");
    expect(repository.markRunFailed).toHaveBeenCalledWith(
      "user-a",
      "00000000-0000-4000-8000-000000000100",
      "runtime_error"
    );
  });
});

describe("RecurringDetectionScheduleService", () => {
  it("does not invoke system discovery in the API role", async () => {
    const repository = {
      systemFindUsersNeedingRefresh: vi.fn(async () => ["user-a"])
    };
    const queue = { enqueueAnalysis: vi.fn(async () => undefined) };
    const service = new RecurringDetectionScheduleService(
      focusedTestDouble<RuntimeConfigService>(config("api")),
      focusedTestDouble<RecurringDetectionRepository>(repository),
      focusedTestDouble<RecurringDetectionQueue>(queue),
      { log: vi.fn() }
    );

    await service.enqueueDailyAnalysis();

    expect(repository.systemFindUsersNeedingRefresh).not.toHaveBeenCalled();
    expect(queue.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it("discovers ownership in the worker and enqueues tenant-scoped jobs", async () => {
    const repository = {
      systemFindUsersNeedingRefresh: vi.fn(async () => ["user-a", "user-b"])
    };
    const queue = { enqueueAnalysis: vi.fn(async () => undefined) };
    const service = new RecurringDetectionScheduleService(
      focusedTestDouble<RuntimeConfigService>(config("worker")),
      focusedTestDouble<RecurringDetectionRepository>(repository),
      focusedTestDouble<RecurringDetectionQueue>(queue),
      { log: vi.fn() }
    );

    await service.enqueueDailyAnalysis();

    expect(repository.systemFindUsersNeedingRefresh).toHaveBeenCalledWith(expect.any(Date), 200);
    expect(queue.enqueueAnalysis).toHaveBeenCalledTimes(2);
    expect(queue.enqueueAnalysis).toHaveBeenCalledWith("user-a", expect.any(Date));
  });
});

describe("RecurringDetectionJobDataSchema", () => {
  it("validates the resumable worker boundary", () => {
    expect(
      RecurringDetectionJobDataSchema.parse({
        userId: "user-a",
        asOf: AS_OF.toISOString(),
        detectorVersion: 1,
        correlationId: "correlation"
      })
    ).toMatchObject({ userId: "user-a", detectorVersion: 1 });
    expect(() => RecurringDetectionJobDataSchema.parse({ userId: "", asOf: "tomorrow" })).toThrow();
  });
});

function repositoryDouble(): {
  findBoundedHistory: ReturnType<typeof vi.fn>;
  beginOrResumeRun: ReturnType<typeof vi.fn>;
  persistStreamRevision: ReturnType<typeof vi.fn>;
  completeRun: ReturnType<typeof vi.fn>;
  markRunFailed: ReturnType<typeof vi.fn>;
} {
  const transaction = {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-a",
    type: "expense" as const,
    description: "NETFLIX",
    amountMinor: 100_000,
    occurredAt: new Date("2026-01-01T12:00:00.000Z"),
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-01T12:00:00.000Z")
  };
  const rows = [
    transaction,
    {
      ...transaction,
      id: "00000000-0000-4000-8000-000000000002",
      occurredAt: new Date("2026-02-01T12:00:00.000Z"),
      createdAt: new Date("2026-02-01T12:00:00.000Z"),
      updatedAt: new Date("2026-02-01T12:00:00.000Z")
    },
    {
      ...transaction,
      id: "00000000-0000-4000-8000-000000000003",
      occurredAt: AS_OF,
      createdAt: AS_OF,
      updatedAt: AS_OF
    }
  ];
  return {
    findBoundedHistory: vi.fn(async () => ({ rows, rowBudgetHit: false })),
    beginOrResumeRun: vi.fn(async () => ({ result: runningRun(), alreadyFinal: false })),
    persistStreamRevision: vi.fn(async () => undefined),
    completeRun: vi.fn(async () => completedRun()),
    markRunFailed: vi.fn(async () => undefined)
  };
}

function runningRun(): RecurringDetectionRunResult {
  return { ...completedRun(), status: "running", completedAt: null, processedStreamCount: 0 };
}

function completedRun(): RecurringDetectionRunResult {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    detectorVersion: 1,
    status: "completed" as const,
    asOf: AS_OF,
    inputWatermark: {
      asOf: AS_OF,
      latestOccurredAt: AS_OF,
      latestUpdatedAt: AS_OF,
      lastTransactionId: "00000000-0000-4000-8000-000000000003",
      rowCount: 3,
      digest: "a".repeat(64)
    },
    sufficiency: { status: "sufficient" as const, observationCount: 3, minimumRequired: 2 },
    resources: {
      rowsScanned: 3,
      runtimeMs: 1,
      rowBudgetHit: false,
      timedOut: false,
      outcome: { status: "completed" as const }
    },
    candidateCount: 0,
    matureCount: 1,
    staleCount: 0,
    abstainedGroupCount: 0,
    processedStreamCount: 1,
    totalStreamCount: 1,
    startedAt: AS_OF,
    completedAt: AS_OF
  };
}

function metricsService(): MetricsService {
  return new MetricsService(
    focusedTestDouble<RedisService>({
      get: vi.fn(),
      set: vi.fn(),
      hashIncrementBy: vi.fn(async () => 1)
    })
  );
}

function config(role: "api" | "worker") {
  return { env: { SERVICE_ROLE: role } };
}
