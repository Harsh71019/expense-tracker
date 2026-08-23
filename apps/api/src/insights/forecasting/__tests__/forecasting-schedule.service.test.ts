import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../../test/mock-drizzle.js";
import { ForecastingScheduleService } from "../forecasting-schedule.service.js";

describe("ForecastingScheduleService", () => {
  it("notifies success after enqueueing every user needing a forecast", async () => {
    const repository = {
      systemFindUsersNeedingForecast: vi.fn().mockResolvedValue(["user-1", "user-2"])
    };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const ntfy = { notify: vi.fn().mockResolvedValue(undefined) };
    const logger = { log: vi.fn(), error: vi.fn() };
    const service = new ForecastingScheduleService(
      focusedTestDouble(repository),
      focusedTestDouble(queue),
      focusedTestDouble(ntfy),
      focusedTestDouble(logger)
    );

    await service.enqueueDaily();

    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(ntfy.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "✅ forecasting.enqueue_daily" })
    );
  });

  it("notifies failure and rethrows when enqueueing fails", async () => {
    const repository = {
      systemFindUsersNeedingForecast: vi.fn().mockRejectedValue(new Error("db unavailable"))
    };
    const queue = { enqueue: vi.fn() };
    const ntfy = { notify: vi.fn().mockResolvedValue(undefined) };
    const logger = { log: vi.fn(), error: vi.fn() };
    const service = new ForecastingScheduleService(
      focusedTestDouble(repository),
      focusedTestDouble(queue),
      focusedTestDouble(ntfy),
      focusedTestDouble(logger)
    );

    await expect(service.enqueueDaily()).rejects.toThrow("db unavailable");
    expect(ntfy.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "❌ forecasting.enqueue_daily failed" })
    );
  });
});
