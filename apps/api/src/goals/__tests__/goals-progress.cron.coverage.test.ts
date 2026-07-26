import type { StoredGoal } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { GoalsProgressCron } from "../goals-progress.cron.js";

const GOAL: StoredGoal = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  userId: "u1",
  name: "Emergency",
  targetMinor: 100_000,
  fundingMode: "tagged",
  tag: "emergency",
  priority: 0,
  status: "active",
  startedMinor: 0,
  createdAt: new Date("2026-07-01"),
  updatedAt: new Date("2026-07-01")
};

function createCron(
  options: Readonly<{
    role?: "api" | "worker";
    current?: StoredGoal | null;
    progress?: number;
    marked?: boolean;
    progressError?: Error;
  }>
) {
  const tx = {};
  const db = { transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx)) };
  const goals = {
    findAllActive: vi.fn().mockResolvedValue([GOAL]),
    findById: vi.fn().mockResolvedValue(options.current === undefined ? GOAL : options.current),
    markAchieved: vi.fn().mockResolvedValue(options.marked ?? true)
  };
  const goalService = {
    getProgress:
      options.progressError === undefined
        ? vi.fn().mockResolvedValue(options.progress ?? 100_000)
        : vi.fn().mockRejectedValue(options.progressError)
  };
  const outbox = { enqueue: vi.fn().mockResolvedValue({}) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { log: vi.fn(), error: vi.fn() };
  const cron = new GoalsProgressCron(
    focusedTestDouble(db),
    focusedTestDouble({ env: { SERVICE_ROLE: options.role ?? "worker" } }),
    focusedTestDouble(goals),
    focusedTestDouble(goalService),
    focusedTestDouble(outbox),
    focusedTestDouble(audit),
    focusedTestDouble(logger)
  );
  return { cron, goals, goalService, outbox, audit, logger };
}

describe("GoalsProgressCron edge coverage", () => {
  it("does nothing outside the worker process", async () => {
    const context = createCron({ role: "api" });
    await context.cron.checkProgress();
    expect(context.goals.findAllActive).not.toHaveBeenCalled();
  });

  it("skips missing, inactive, below-target, and lost-CAS goals", async () => {
    for (const options of [
      { current: null },
      { current: { ...GOAL, status: "achieved" as const } },
      { progress: 99_999 },
      { marked: false }
    ]) {
      const context = createCron(options);
      await context.cron.checkProgress();
      expect(context.outbox.enqueue).not.toHaveBeenCalled();
    }
  });

  it("records an achieved goal and reports per-goal failures without aborting the sweep", async () => {
    const achieved = createCron({});
    await achieved.cron.checkProgress();
    expect(achieved.outbox.enqueue).toHaveBeenCalled();
    expect(achieved.audit.record).toHaveBeenCalled();
    expect(achieved.logger.log).toHaveBeenCalledTimes(2);

    const failed = createCron({ progressError: new Error("failed") });
    await failed.cron.checkProgress();
    expect(failed.logger.error).toHaveBeenCalled();
    expect(failed.logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ activeCount: 1, achievedCount: 0 }),
      "goal progress checked"
    );
  });
});
