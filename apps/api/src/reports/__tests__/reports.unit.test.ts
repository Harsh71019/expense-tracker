import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { MonthlyRollupService } from "../monthly-rollup.service.js";

import { RollupsRefreshService } from "../rollups-refresh.service.js";

describe("Reports Services Unit Tests", () => {
  const sampleRollup = {
    userId: "u1",
    month: "2026-01",
    totalIncomeMinor: 100000,
    totalExpenseMinor: 50000,
    byCategory: [
      {
        categoryId: "123e4567-e89b-12d3-a456-426614174001",
        spentMinor: 50000,
        incomeMinor: 0,
        txnCount: 10
      }
    ],
    byAccount: [
      {
        accountId: "123e4567-e89b-12d3-a456-426614174002",
        netMinor: 50000
      }
    ],
    computedAt: new Date()
  };

  describe("MonthlyRollupService", () => {
    it("getOrCompute returns monthly rollup data when present", async () => {
      const mockRollupRepo = {
        findByMonth: vi.fn(async () => sampleRollup),
        recompute: vi.fn(async () => sampleRollup)
      };

      // @ts-expect-error mock service args
      const service = new MonthlyRollupService(mockRollupRepo);
      const res = await service.getOrCompute("u1", "2026-01");

      expect(res?.month).toBe("2026-01");
      expect(res?.totalIncomeMinor).toBe(100000);
      expect(res?.byCategory[0]?.spentMinor).toBe(50000);
    });
  });

  describe("RollupsRefreshService", () => {
    it("refresh recomputes rollups for distinct user ids on worker role", async () => {
      const mockConfig = createMockConfig("worker");
      const mockRollupRepo = {
        distinctUserIds: vi.fn(async () => ["u1"]),
        recompute: vi.fn(async () => sampleRollup)
      };
      const mockLogger = { log: vi.fn(), error: vi.fn() };

      // @ts-expect-error mock service args
      const service = new RollupsRefreshService(mockConfig, mockRollupRepo, mockLogger);
      await service.refresh();

      expect(mockRollupRepo.distinctUserIds).toHaveBeenCalled();
      expect(mockRollupRepo.recompute).toHaveBeenCalled();
    });
  });
});
