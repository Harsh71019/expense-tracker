import { describe, expect, it, vi } from "vitest";

import { CategoryDiagnosticReadService } from "../category-diagnostic-read.service.js";

describe("CategoryDiagnosticReadService", () => {
  it("counts active categories and essential categories correctly", async () => {
    const mockRows = [
      {
        id: "1",
        kind: "expense",
        group: "essential",
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "2",
        kind: "expense",
        group: "lifestyle",
        updatedAt: new Date("2026-08-05T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "3",
        kind: "income",
        group: null,
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }
    ];

    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockRows)
          })
        })
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new CategoryDiagnosticReadService(dbMock);
    const result = await service.getCategoryDiagnosticFacts("user-1");

    expect(result.totalActiveCategoryCount).toBe(3);
    expect(result.activeExpenseCategoryCount).toBe(2);
    expect(result.essentialExpenseCategoryCount).toBe(1);
    expect(result.lastUpdatedAt).toEqual(new Date("2026-08-10T00:00:00.000Z"));
  });
});
