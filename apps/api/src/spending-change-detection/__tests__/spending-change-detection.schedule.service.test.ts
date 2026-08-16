import { describe, expect, it, vi } from "vitest";
import { Logger } from "nestjs-pino";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";
import { SpendingChangeDetectionQueue } from "../spending-change-detection.queue.js";
import { SpendingChangeDetectionRepository } from "../spending-change-detection.repository.js";
import { SpendingChangeDetectionScheduleService } from "../spending-change-detection.schedule.service.js";

describe("SpendingChangeDetectionScheduleService", () => {
  it("does not run on non-worker roles", async () => {
    const mockConfig = {
      env: { SERVICE_ROLE: "api" }
    };
    const mockRepo = {
      systemFindUsersNeedingRefresh: vi.fn(async () => [])
    };
    const mockQueue = {
      enqueueAnalysis: vi.fn(async () => "job-id")
    };
    const mockLogger = { log: vi.fn() };

    const service = new SpendingChangeDetectionScheduleService(
      focusedTestDouble<RuntimeConfigService>(mockConfig),
      focusedTestDouble<SpendingChangeDetectionRepository>(mockRepo),
      focusedTestDouble<SpendingChangeDetectionQueue>(mockQueue),
      focusedTestDouble<Pick<Logger, "log">>(mockLogger)
    );

    await service.enqueueDailyAnalysis();
    expect(mockRepo.systemFindUsersNeedingRefresh).not.toHaveBeenCalled();
    expect(mockQueue.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it("discovers candidates across tenants and enqueues jobs on worker role", async () => {
    const mockConfig = {
      env: { SERVICE_ROLE: "worker" }
    };
    const mockRepo = {
      systemFindUsersNeedingRefresh: vi.fn(async () => ["user-1", "user-2"])
    };
    const mockQueue = {
      enqueueAnalysis: vi.fn(async () => "job-id")
    };
    const mockLogger = { log: vi.fn() };

    const service = new SpendingChangeDetectionScheduleService(
      focusedTestDouble<RuntimeConfigService>(mockConfig),
      focusedTestDouble<SpendingChangeDetectionRepository>(mockRepo),
      focusedTestDouble<SpendingChangeDetectionQueue>(mockQueue),
      focusedTestDouble<Pick<Logger, "log">>(mockLogger)
    );

    await service.enqueueDailyAnalysis();
    expect(mockRepo.systemFindUsersNeedingRefresh).toHaveBeenCalled();
    expect(mockQueue.enqueueAnalysis).toHaveBeenCalledWith("user-1", expect.any(Date));
    expect(mockQueue.enqueueAnalysis).toHaveBeenCalledWith("user-2", expect.any(Date));
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ userCount: 2 }),
      expect.any(String)
    );
  });
});
