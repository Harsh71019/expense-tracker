import { describe, expect, it, vi } from "vitest";

import type { AccountRepository } from "../../accounts/account.repository.js";
import type { AssetRepository } from "../../assets/asset.repository.js";
import type { ValuationRepository } from "../../assets/valuation.repository.js";
import type { CategoryRepository } from "../../categories/category.repository.js";
import type { MonthlyRollupService } from "../../reports/monthly-rollup.service.js";
import type { RecurringRuleRepository } from "../../recurring/recurring-rule.repository.js";
import type { TransactionRepository } from "../../transactions/transaction.repository.js";
import type { DashboardRepository } from "../dashboard.repository.js";
import { DashboardService } from "../dashboard.service.js";

describe("DashboardService Unit Tests", () => {
  const createService = (opts: {
    accounts?: unknown;
    transactions?: unknown;
    categories?: unknown;
    assets?: unknown;
    valuations?: unknown;
    recurringRules?: unknown;
    rollups?: unknown;
    dashboard?: unknown;
  }) => {
    // @ts-expect-error mock repos
    const accountsRepo: AccountRepository = opts.accounts ?? {
      list: vi.fn(async () => [
        {
          id: "acc_1",
          userId: "u1",
          name: "Checking",
          type: "bank",
          balanceMinor: 100000,
          currency: "INR",
          isArchived: false,
          openingBalanceMinor: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    };
    // @ts-expect-error mock repos
    const txRepo: TransactionRepository = opts.transactions ?? {
      findMany: vi.fn(async () => ({ items: [], pageInfo: { hasMore: false, nextCursor: null } }))
    };
    // @ts-expect-error mock repos
    const catRepo: CategoryRepository = opts.categories ?? { list: vi.fn(async () => []) };
    // @ts-expect-error mock repos
    const assetRepo: AssetRepository = opts.assets ?? { list: vi.fn(async () => []) };
    // @ts-expect-error mock repos
    const valRepo: ValuationRepository = opts.valuations ?? {
      listByAsset: vi.fn(async () => []),
      latestByAsset: vi.fn(async () => null)
    };
    // @ts-expect-error mock repos
    const recRepo: RecurringRuleRepository = opts.recurringRules ?? { list: vi.fn(async () => []) };
    // @ts-expect-error mock repos
    const rollupsService: MonthlyRollupService = opts.rollups ?? {
      getOrCompute: vi.fn(async () => null)
    };
    // @ts-expect-error mock repos
    const dashRepo: DashboardRepository = opts.dashboard ?? {
      cashflowDaily: vi.fn(async () => new Map()),
      categoryTotalsDaily: vi.fn(async () => []),
      categoryTotals: vi.fn(async () => []),
      accountsBalanceMinorAsOf: vi.fn(async () => 100000),
      assetsValueMinorAsOf: vi.fn(async () => 0),
      receivablesOutstandingMinorAsOf: vi.fn(async () => 0)
    };

    return new DashboardService(
      accountsRepo,
      txRepo,
      catRepo,
      assetRepo,
      valRepo,
      recRepo,
      rollupsService,
      dashRepo
    );
  };

  it("getSummary returns total balance, assets, liabilities", async () => {
    const service = createService({});
    const summary = await service.getSummary("u1");

    expect(summary.totalBalanceMinor).toBe(100000);
    expect(summary.activeAccountCount).toBe(1);
    expect(summary.assetsMinor).toBe(100000);
    expect(summary.liabilitiesMinor).toBe(0);
  });

  it("getStats returns stat trends for user", async () => {
    const service = createService({});
    const stats = await service.getStats("u1", "2026-01");

    expect(stats.period).toBe("2026-01");
    expect(stats.netWorth.valueMinor).toBe(100000);
  });
});
