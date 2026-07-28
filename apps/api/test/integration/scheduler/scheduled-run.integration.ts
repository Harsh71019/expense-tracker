import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ScheduledRunCoordinator } from "../../../src/common/scheduler/scheduled-run.coordinator.js";
import { ScheduledRunRepository } from "../../../src/common/scheduler/scheduled-run.repository.js";
import { createTestDb } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const LOGGER = { log: vi.fn(), error: vi.fn() };

describe("scheduled run leadership", () => {
  let testDb: TestDb;
  let runs: ScheduledRunRepository;
  let coordinator: ScheduledRunCoordinator;

  beforeAll(async () => {
    testDb = await createTestDb();
    runs = new ScheduledRunRepository(testDb.db);
    coordinator = new ScheduledRunCoordinator(runs, LOGGER);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("elects exactly one of five workers for a deterministic schedule window", async () => {
    const task = vi.fn(async () => 7);
    const now = new Date("2026-07-28T02:00:00.000Z");

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => coordinator.run("integration.daily", "daily", task, now))
    );

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(task).toHaveBeenCalledTimes(1);
    await expect(runs.systemLatestByJob()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "integration.daily:2026-07-28",
          status: "completed",
          itemCount: 7,
          attemptCount: 1
        })
      ])
    );
  });

  it("reclaims an expired run lease and increments durable attempts", async () => {
    const now = new Date("2026-07-28T03:00:00.000Z");
    await runs.tryStart({
      id: "integration.recovery:2026-07-28",
      jobName: "integration.recovery",
      scheduleWindow: "2026-07-28",
      scheduledFor: now,
      claimToken: "00000000-0000-4000-8000-000000000000",
      leaseUntil: new Date(now.getTime() - 1),
      now: new Date(now.getTime() - 60_000)
    });

    await expect(
      coordinator.run("integration.recovery", "daily", async () => 1, now)
    ).resolves.toBe(true);

    const recovered = (await runs.systemLatestByJob()).find(
      (run) => run.jobName === "integration.recovery"
    );
    expect(recovered).toMatchObject({ status: "completed", attemptCount: 2, itemCount: 1 });
  });

  it("marks abandoned overlong runs failed for operator visibility", async () => {
    const startedAt = new Date("2026-07-28T04:00:00.000Z");
    await runs.tryStart({
      id: "integration.overlong:2026-07-28",
      jobName: "integration.overlong",
      scheduleWindow: "2026-07-28",
      scheduledFor: startedAt,
      claimToken: "00000000-0000-4000-8000-000000000000",
      leaseUntil: new Date(startedAt.getTime() + 1_000),
      now: startedAt
    });

    const expired = await runs.systemFailExpired(new Date(startedAt.getTime() + 2_000));

    expect(expired).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "integration.overlong:2026-07-28",
          status: "failed",
          failureSummary: "Scheduler lease expired before completion."
        })
      ])
    );
  });
});
