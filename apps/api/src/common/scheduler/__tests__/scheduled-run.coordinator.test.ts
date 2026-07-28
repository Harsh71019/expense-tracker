import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../../test/mock-drizzle.js";
import { ScheduledRunCoordinator, toScheduleWindow } from "../scheduled-run.coordinator.js";

describe("ScheduledRunCoordinator", () => {
  it("derives deterministic IST day and minute windows", () => {
    const now = new Date("2026-07-27T20:31:42.000Z");

    expect(toScheduleWindow(now, "daily")).toBe("2026-07-28");
    expect(toScheduleWindow(now, "minute")).toBe("2026-07-28T02:01");
  });

  it("records completion metadata for the elected runner", async () => {
    const runs = {
      tryStart: vi.fn().mockResolvedValue({ id: "job:window" }),
      complete: vi.fn().mockResolvedValue(true),
      fail: vi.fn()
    };
    const logger = { log: vi.fn(), error: vi.fn() };
    const coordinator = new ScheduledRunCoordinator(
      focusedTestDouble(runs),
      focusedTestDouble(logger)
    );

    await expect(
      coordinator.run(
        "rollups.refresh",
        "daily",
        async () => 12,
        new Date("2026-07-28T02:00:00.000Z")
      )
    ).resolves.toBe(true);

    expect(runs.complete).toHaveBeenCalledWith(
      "rollups.refresh:2026-07-28",
      expect.any(String),
      expect.any(Date),
      expect.any(Number),
      12
    );
    expect(logger.log).toHaveBeenCalled();
  });

  it("skips work when another worker owns the schedule window", async () => {
    const task = vi.fn(async () => 1);
    const coordinator = new ScheduledRunCoordinator(
      focusedTestDouble({ tryStart: vi.fn().mockResolvedValue(null) }),
      focusedTestDouble({ log: vi.fn(), error: vi.fn() })
    );

    await expect(coordinator.run("job", "minute", task)).resolves.toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  it("persists a bounded failure summary before rethrowing", async () => {
    const runs = {
      tryStart: vi.fn().mockResolvedValue({ id: "job:window" }),
      complete: vi.fn(),
      fail: vi.fn().mockResolvedValue(undefined)
    };
    const coordinator = new ScheduledRunCoordinator(
      focusedTestDouble(runs),
      focusedTestDouble({ log: vi.fn(), error: vi.fn() })
    );

    await expect(
      coordinator.run("job", "daily", async () => {
        throw new Error("work failed");
      })
    ).rejects.toThrow("work failed");
    expect(runs.fail).toHaveBeenCalledWith(
      expect.stringContaining("job:"),
      expect.any(String),
      expect.any(Date),
      expect.any(Number),
      "work failed"
    );
  });
});
