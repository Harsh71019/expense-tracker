import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { MonthlyRollupRepository } from "../monthly-rollup.repository.js";

describe("MonthlyRollupRepository Unit Tests", () => {
  const sampleRollupRow = {
    userId: "u1",
    month: "2026-01",
    totalIncomeMinor: 100000,
    totalExpenseMinor: 50000,
    totalCashOutflowMinor: 50000,
    totalConsumptionMinor: 50000,
    totalAssetFundingMinor: 0,
    consumptionByCategory: [],
    formulaVersion: 2,
    byCategory: [],
    byAccount: [],
    computedAt: new Date()
  };

  it("findByMonth returns rollup or null", async () => {
    const mockDb = createMockDrizzleDb([sampleRollupRow]);
    const repo = new MonthlyRollupRepository(mockDb);

    const res = await repo.findByMonth("u1", "2026-01");
    expect(res?.month).toBe("2026-01");
  });

  it("recompute recalculates and upserts monthly rollup data", async () => {
    // Same mocked row array backs all three aggregate queries in recompute()
    // (byCategory, byAccount, totals), so this row carries every field each
    // query's `.select()` projects.
    const aggregateRow = {
      categoryId: "123e4567-e89b-12d3-a456-426614174000",
      spentMinor: "5000",
      incomeMinor: "0",
      txnCount: 1,
      accountId: "223e4567-e89b-12d3-a456-426614174000",
      netMinor: "-5000",
      totalExpenseMinor: "5000",
      totalIncomeMinor: "0",
      totalConsumptionMinor: "5000",
      totalAssetFundingMinor: "0"
    };
    const mockDb = createMockDrizzleDb([aggregateRow]);
    const repo = new MonthlyRollupRepository(mockDb);

    const res = await repo.recompute("u1", "2026-01");
    expect(res.month).toBe("2026-01");
    expect(res.totalExpenseMinor).toBe(5000);
  });

  it("distinctUserIds returns list of user IDs", async () => {
    const mockDb = createMockDrizzleDb([{ userId: "u1" }]);
    const repo = new MonthlyRollupRepository(mockDb);

    const res = await repo.distinctUserIds();
    expect(res).toEqual(["u1"]);
  });
});
