import { describe, expect, it, vi } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { DashboardRepository } from "../dashboard.repository.js";

describe("DashboardRepository Unit Tests", () => {
  it("cashflowDaily computes daily income and expense totals", async () => {
    const mockDb = createMockDrizzleDb([
      { day: "2026-01-01", incomeMinor: "10000", expenseMinor: "5000" }
    ]);
    // @ts-expect-error mock chaining
    mockDb.groupBy = vi.fn().mockReturnValue(mockDb);

    const repo = new DashboardRepository(mockDb);

    const res = await repo.cashflowDaily("u1", new Date("2026-01-01"), new Date("2026-01-02"));
    expect(res.get("2026-01-01")).toEqual({ incomeMinor: 10000, expenseMinor: 5000 });
  });

  it("categoryTotals returns category spending totals", async () => {
    const mockDb = createMockDrizzleDb([
      { categoryId: "cat_1", spentMinor: "5000", incomeMinor: "0", txnCount: 2 }
    ]);
    // @ts-expect-error mock chaining
    mockDb.groupBy = vi.fn().mockReturnValue(mockDb);

    const repo = new DashboardRepository(mockDb);

    const res = await repo.categoryTotals("u1", new Date("2026-01-01"), new Date("2026-01-02"));
    expect(res).toHaveLength(1);
    expect(res[0]?.spentMinor).toBe(5000);
  });

  it("accountsBalanceMinorAsOf computes total account balance as of date", async () => {
    const mockDb = createMockDrizzleDb([
      { id: "acc_1", accountId: "acc_1", openingBalanceMinor: 100000, deltaMinor: "-20000" }
    ]);
    // @ts-expect-error mock chaining
    mockDb.groupBy = vi.fn().mockReturnValue(mockDb);

    const repo = new DashboardRepository(mockDb);

    const res = await repo.accountsBalanceMinorAsOf("u1", new Date("2026-01-01"));
    expect(res).toBe(80000);
  });

  it("assetsValueMinorAsOf computes total asset value as of date", async () => {
    const mockDb = createMockDrizzleDb([{ id: "ast_1", assetId: "ast_1", valueMinor: 500000 }]);
    // @ts-expect-error mock chaining
    mockDb.orderBy = vi.fn().mockReturnValue([{ assetId: "ast_1", valueMinor: 500000 }]);

    const repo = new DashboardRepository(mockDb);

    const res = await repo.assetsValueMinorAsOf("u1", new Date("2026-01-01"));
    expect(res).toBe(500000);
  });
});
