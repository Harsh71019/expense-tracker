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

describe("DashboardService Extra Unit Tests", () => {
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
      list: vi.fn(async () => [])
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
      categoryTotals: vi.fn(async () => [])
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

  it("getRecentActivity formats recent transactions with account names", async () => {
    const mockTx = {
      id: "tx_1",
      accountId: "acc_1",
      categoryId: "cat_1",
      type: "expense" as const,
      amountMinor: 5000,
      description: "Groceries",
      occurredAt: new Date("2026-01-01"),
      tags: ["food"]
    };

    const mockAccount = {
      id: "acc_1",
      name: "HDFC Savings"
    };

    const service = createService({
      transactions: {
        findMany: vi.fn(async () => ({
          items: [mockTx],
          pageInfo: { hasMore: false, nextCursor: null }
        }))
      },
      accounts: {
        list: vi.fn(async () => [mockAccount])
      }
    });

    const recent = await service.getRecentActivity("u1", 5);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.accountName).toBe("HDFC Savings");
  });

  it("getTopSpending returns enriched and sorted category totals", async () => {
    const mockTotals = [
      { categoryId: "cat_1", spentMinor: 50000, incomeMinor: 0, txnCount: 5 },
      { categoryId: "cat_2", spentMinor: 150000, incomeMinor: 0, txnCount: 2 }
    ];

    const mockCategories = [
      { id: "cat_1", name: "Food", color: "blue", icon: "utensils" },
      { id: "cat_2", name: "Rent", color: "red", icon: "home" }
    ];

    const service = createService({
      dashboard: {
        categoryTotals: vi.fn(async () => mockTotals)
      },
      categories: {
        list: vi.fn(async () => mockCategories)
      }
    });

    const top = await service.getTopSpending("u1", "1M", 10);
    expect(top).toHaveLength(2);
    expect(top[0]?.name).toBe("Rent");
    expect(top[0]?.amountMinor).toBe(150000);
  });

  it("getSpendMix computes essential, lifestyle, and uncategorized breakdowns", async () => {
    const mockTotals = [
      { categoryId: "cat_1", spentMinor: 50000, incomeMinor: 0, txnCount: 5 },
      { categoryId: "cat_2", spentMinor: 30000, incomeMinor: 0, txnCount: 2 },
      { categoryId: undefined, spentMinor: 20000, incomeMinor: 0, txnCount: 1 }
    ];

    const mockCategories = [
      { id: "cat_1", name: "Groceries", group: "essential" },
      { id: "cat_2", name: "Movies", group: "lifestyle" }
    ];

    const service = createService({
      dashboard: {
        categoryTotals: vi.fn(async () => mockTotals)
      },
      categories: {
        list: vi.fn(async () => mockCategories)
      }
    });

    const mix = await service.getSpendMix("u1", "1M");
    expect(mix.totalMinor).toBe(100000);
    expect(mix.essential.amountMinor).toBe(50000);
    expect(mix.essential.pct).toBe(50);
    expect(mix.lifestyle.amountMinor).toBe(30000);
    expect(mix.lifestyle.pct).toBe(30);
    expect(mix.uncategorized.amountMinor).toBe(20000);
    expect(mix.uncategorized.pct).toBe(20);
  });

  it("getInvestments returns investment performance", async () => {
    const mockAssets = [
      {
        id: "asset_1",
        userId: "u1",
        name: "Nifty 50 Index",
        kind: "investment" as const,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const mockValuations = [
      { id: "v2", assetId: "asset_1", valueMinor: 120000, asOfDate: new Date("2026-02-01") },
      { id: "v1", assetId: "asset_1", valueMinor: 100000, asOfDate: new Date("2026-01-01") }
    ];

    const service = createService({
      assets: {
        list: vi.fn(async () => mockAssets)
      },
      valuations: {
        listByAsset: vi.fn(async () => mockValuations)
      }
    });

    const investments = await service.getInvestments("u1");
    expect(investments.items).toHaveLength(1);
    expect(investments.items[0]?.name).toBe("Nifty 50 Index");
    expect(investments.items[0]?.currentValueMinor).toBe(120000);
  });
});
