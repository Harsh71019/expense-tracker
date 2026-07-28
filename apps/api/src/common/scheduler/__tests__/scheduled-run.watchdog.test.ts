import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../../test/mock-config.js";
import { focusedTestDouble } from "../../../test/mock-drizzle.js";
import { ScheduledRunWatchdog } from "../scheduled-run.watchdog.js";

describe("ScheduledRunWatchdog", () => {
  it("does not inspect global run state in the API process", async () => {
    const coordinator = { run: vi.fn() };
    const watchdog = new ScheduledRunWatchdog(
      createMockConfig("api"),
      focusedTestDouble(coordinator),
      focusedTestDouble({}),
      focusedTestDouble({ error: vi.fn() })
    );

    await watchdog.inspect();

    expect(coordinator.run).not.toHaveBeenCalled();
  });

  it("marks expired leases and reports stale expected jobs", async () => {
    const old = new Date(Date.now() - 9 * 24 * 60 * 60_000);
    const runs = {
      systemFailExpired: vi.fn().mockResolvedValue([
        {
          id: "balances.verify:old",
          jobName: "balances.verify",
          startedAt: old
        }
      ]),
      systemLatestByJob: vi.fn().mockResolvedValue([
        {
          jobName: "balances.verify",
          scheduledFor: old,
          status: "failed"
        }
      ]),
      systemDeleteTerminalBefore: vi.fn().mockResolvedValue(3)
    };
    const coordinator = {
      run: vi.fn(
        async (_name: string, _cadence: string, task: () => Promise<number>): Promise<boolean> => {
          await task();
          return true;
        }
      )
    };
    const logger = { error: vi.fn() };
    const watchdog = new ScheduledRunWatchdog(
      createMockConfig("worker"),
      focusedTestDouble(coordinator),
      focusedTestDouble(runs),
      focusedTestDouble(logger)
    );

    await watchdog.inspect();

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(runs.systemDeleteTerminalBefore).toHaveBeenCalledWith(expect.any(Date));
  });
});
