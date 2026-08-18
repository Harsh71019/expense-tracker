import { describe, expect, it, vi } from "vitest";

import { GoalDiagnosticReadService } from "../goal-diagnostic-read.service.js";

describe("GoalDiagnosticReadService", () => {
  it("counts active goals vs completed or abandoned goals", async () => {
    const mockGoals = [
      {
        id: "goal-1",
        status: "active",
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "goal-2",
        status: "completed",
        updatedAt: new Date("2026-08-05T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "goal-3",
        status: "active",
        updatedAt: new Date("2026-08-12T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }
    ];

    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockGoals)
          })
        })
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new GoalDiagnosticReadService(dbMock);
    const result = await service.getGoalDiagnosticFacts("user-1");

    expect(result.totalGoalCount).toBe(3);
    expect(result.activeGoalCount).toBe(2);
    expect(result.hasActiveGoals).toBe(true);
    expect(result.lastUpdatedAt).toEqual(new Date("2026-08-12T00:00:00.000Z"));
  });
});
