import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { GoalsProgressCron } from "../goals-progress.cron.js";

describe("GoalsProgressCron Unit Tests", () => {
  it("checkProgress checks progress for active goals on worker role", async () => {
    const sampleGoal = {
      id: "g1",
      userId: "u1",
      name: "Emergency Fund",
      targetMinor: 500000,
      status: "active" as const,
      fundingMode: "tagged" as const,
      startedMinor: 0,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockDb = {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    const mockConfig = createMockConfig("worker");
    const mockGoals = {
      findAllActive: vi.fn(async () => [sampleGoal]),
      findById: vi.fn(async () => sampleGoal),
      markAchieved: vi.fn(async () => true)
    };
    const mockService = {
      getProgress: vi.fn(async () => 500000)
    };
    const mockOutbox = { enqueue: vi.fn(async () => undefined) };
    const mockAudit = { record: vi.fn(async () => undefined) };
    const mockLogger = { log: vi.fn(), error: vi.fn() };

    const cron = new GoalsProgressCron(
      // @ts-expect-error mock cron args
      mockDb,
      mockConfig,
      mockGoals,
      mockService,
      mockOutbox,
      mockAudit,
      mockLogger
    );
    await cron.checkProgress();

    expect(mockGoals.findAllActive).toHaveBeenCalled();
    expect(mockService.getProgress).toHaveBeenCalled();
  });
});
