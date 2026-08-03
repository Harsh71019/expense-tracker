import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { DashboardController } from "../dashboard.controller.js";
import type { DashboardService } from "../dashboard.service.js";

describe("DashboardController", () => {
  it("passes the authenticated tenant to monthly spending", async () => {
    const monthlySpending = {
      period: "2026-08",
      asOf: new Date("2026-08-03T06:00:00.000Z"),
      totalMinor: 1_000,
      daily: [],
      weekly: []
    };
    const getMonthlySpending = vi.fn().mockResolvedValue(monthlySpending);
    const controller = new DashboardController(
      focusedTestDouble<DashboardService>({ getMonthlySpending })
    );

    await expect(controller.getMonthlySpending({ id: "user-a" })).resolves.toEqual(monthlySpending);
    expect(getMonthlySpending).toHaveBeenCalledWith("user-a");
  });
});
