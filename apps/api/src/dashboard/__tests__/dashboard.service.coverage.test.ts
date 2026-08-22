import { afterEach, describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { DashboardService } from "../dashboard.service.js";

const NOW = new Date("2026-07-15T06:00:00.000Z");
const ACCOUNT_ID = "123e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "223e4567-e89b-42d3-a456-426614174000";
const ASSET_ID = "323e4567-e89b-42d3-a456-426614174000";

type Overrides = Readonly<{
  accounts?: unknown;
  transactions?: unknown;
  categories?: unknown;
  assets?: unknown;
  valuations?: unknown;
  recurringRules?: unknown;
  rollups?: unknown;
  dashboard?: unknown;
}>;

function createService(overrides: Overrides = {}) {
  const collaborators = {
    accounts: overrides.accounts ?? { list: vi.fn().mockResolvedValue([]) },
    transactions:
      overrides.transactions ??
      ({
        findMany: vi.fn().mockResolvedValue({
          items: [],
          pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
        })
      } satisfies Record<string, unknown>),
    categories: overrides.categories ?? { list: vi.fn().mockResolvedValue([]) },
    assets: overrides.assets ?? { list: vi.fn().mockResolvedValue([]) },
    valuations: overrides.valuations ?? { listByAsset: vi.fn().mockResolvedValue([]) },
    recurringRules: overrides.recurringRules ?? { list: vi.fn().mockResolvedValue([]) },
    rollups: overrides.rollups ?? { getOrCompute: vi.fn().mockResolvedValue(null) },
    dashboard:
      overrides.dashboard ??
      ({
        cashflowDaily: vi.fn().mockResolvedValue(new Map()),
        categoryTotals: vi.fn().mockResolvedValue([]),
        accountsBalanceMinorAsOf: vi.fn().mockResolvedValue(0),
        assetsValueMinorAsOf: vi.fn().mockResolvedValue(0),
        receivablesOutstandingMinorAsOf: vi.fn().mockResolvedValue(0)
      } satisfies Record<string, unknown>)
  };
  const service = new DashboardService(
    focusedTestDouble(collaborators.accounts),
    focusedTestDouble(collaborators.transactions),
    focusedTestDouble(collaborators.categories),
    focusedTestDouble(collaborators.assets),
    focusedTestDouble(collaborators.valuations),
    focusedTestDouble(collaborators.recurringRules),
    focusedTestDouble(collaborators.rollups),
    focusedTestDouble(collaborators.dashboard)
  );
  return { service, ...collaborators };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DashboardService summary, activity, and stats", () => {
  it("separates positive and negative balances", async () => {
    const context = createService({
      accounts: {
        list: vi.fn().mockResolvedValue([
          { id: "positive", balanceMinor: 100_000 },
          { id: "negative", balanceMinor: -35_000 },
          { id: "zero", balanceMinor: 0 }
        ])
      }
    });

    await expect(context.service.getSummary("u1")).resolves.toEqual({
      totalBalanceMinor: 65_000,
      activeAccountCount: 3,
      assetsMinor: 100_000,
      liabilitiesMinor: 35_000
    });
  });

  it("uses fallback account names and omits missing category ids from activity", async () => {
    const transaction = {
      id: "tx-1",
      accountId: ACCOUNT_ID,
      type: "expense",
      amountMinor: 500,
      description: "Unknown",
      occurredAt: NOW,
      tags: []
    };
    const context = createService({
      transactions: {
        findMany: vi.fn().mockResolvedValue({
          items: [transaction],
          pageInfo: { nextCursor: null, hasMore: false, limit: 1 }
        })
      }
    });

    await expect(context.service.getRecentActivity("u1", 1)).resolves.toEqual([
      {
        id: "tx-1",
        accountId: ACCOUNT_ID,
        accountName: "Unknown account",
        type: "expense",
        amountMinor: 500,
        description: "Unknown",
        occurredAt: NOW,
        tags: []
      }
    ]);
  });

  it("builds populated trends for the current month and uses both net-worth as-of paths", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let rollupCall = 0;
    const rollups = {
      getOrCompute: vi.fn().mockImplementation(async () => {
        rollupCall += 1;
        return rollupCall === 1
          ? null
          : { totalExpenseMinor: rollupCall * 100, totalIncomeMinor: rollupCall * 200 };
      })
    };
    const dashboard = {
      accountsBalanceMinorAsOf: vi.fn().mockResolvedValue(50_000),
      assetsValueMinorAsOf: vi.fn().mockResolvedValue(25_000),
      receivablesOutstandingMinorAsOf: vi.fn().mockResolvedValue(0)
    };
    const context = createService({ rollups, dashboard });

    const stats = await context.service.getStats("u1", undefined);

    expect(stats.period).toBe("2026-07");
    expect(stats.spent.trend).toHaveLength(6);
    expect(stats.spent.trend[0]).toBe(0);
    expect(stats.netWorth.trend).toEqual(Array.from({ length: 6 }, () => 75_000));
    expect(dashboard.accountsBalanceMinorAsOf).toHaveBeenCalledTimes(6);
  });
});

describe("DashboardService cashflow and categories", () => {
  it("fills missing daily cashflow values for one week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const dashboard = {
      cashflowDaily: vi
        .fn()
        .mockResolvedValue(new Map([["2026-07-15", { incomeMinor: 1_000, expenseMinor: 250 }]]))
    };
    const context = createService({ dashboard });

    const result = await context.service.getCashflow("u1", "1W");

    expect(result.buckets).toHaveLength(7);
    expect(result.buckets.at(-1)).toEqual({
      label: "2026-07-15",
      incomeMinor: 1_000,
      expenseMinor: 250
    });
    expect(result.buckets[0]).toMatchObject({ incomeMinor: 0, expenseMinor: 0 });
  });

  it("groups a month of daily cashflow into weekly buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const dashboard = {
      cashflowDaily: vi
        .fn()
        .mockResolvedValue(new Map([["2026-07-15", { incomeMinor: 500, expenseMinor: 100 }]]))
    };
    const context = createService({ dashboard });

    const result = await context.service.getCashflow("u1", "1M");

    expect(result.buckets).toHaveLength(5);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.incomeMinor, 0)).toBe(500);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.expenseMinor, 0)).toBe(100);
  });

  it("returns every day in the current month and elapsed weekly spending buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const dashboard = {
      cashflowDaily: vi.fn().mockResolvedValue(
        new Map([
          ["2026-07-01", { incomeMinor: 0, expenseMinor: 1_000 }],
          ["2026-07-08", { incomeMinor: 0, expenseMinor: 2_000 }],
          ["2026-07-15", { incomeMinor: 500, expenseMinor: 3_000 }]
        ])
      )
    };
    const context = createService({ dashboard });

    const result = await context.service.getMonthlySpending("u1");

    expect(result.period).toBe("2026-07");
    expect(result.asOf).toEqual(NOW);
    expect(result.daily).toHaveLength(31);
    expect(result.weekly).toHaveLength(3);
    expect(result.totalMinor).toBe(6_000);
    expect(result.daily.at(-1)?.amountMinor).toBe(0);
    expect(result.weekly.map((week) => week.amountMinor)).toEqual([1_000, 2_000, 3_000]);
    expect(dashboard.cashflowDaily).toHaveBeenCalledWith(
      "u1",
      new Date("2026-06-30T18:30:00.000Z"),
      new Date("2026-07-15T18:29:59.999Z")
    );
  });

  it("maps long-range month rollups and zero-fills missing months", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let call = 0;
    const rollups = {
      getOrCompute: vi.fn().mockImplementation(async () => {
        call += 1;
        return call % 2 === 0 ? { totalIncomeMinor: 2_000, totalExpenseMinor: 1_000 } : null;
      })
    };
    const context = createService({ rollups });

    const sixMonths = await context.service.getCashflow("u1", "6M");
    const twelveMonths = await context.service.getCashflow("u1", "12M");

    expect(sixMonths.buckets).toHaveLength(6);
    expect(twelveMonths.buckets).toHaveLength(12);
    expect(sixMonths.buckets).toContainEqual(
      expect.objectContaining({ incomeMinor: 0, expenseMinor: 0 })
    );
    expect(sixMonths.buckets).toContainEqual(
      expect.objectContaining({ incomeMinor: 2_000, expenseMinor: 1_000 })
    );
  });

  it("merges long-range rollups for top spending and honors the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const rollups = {
      getOrCompute: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          byCategory: [{ categoryId: CATEGORY_ID, spentMinor: 5_000, incomeMinor: 0, txnCount: 2 }]
        })
    };
    const categories = {
      list: vi
        .fn()
        .mockResolvedValue([{ id: CATEGORY_ID, name: "Food", icon: "fork", color: "#112233" }])
    };
    const context = createService({ rollups, categories });

    await expect(context.service.getTopSpending("u1", "6M", 1)).resolves.toEqual([
      expect.objectContaining({ categoryId: CATEGORY_ID, amountMinor: 25_000, name: "Food" })
    ]);
  });

  it("returns zero percentages for an empty spend mix and treats unknown categories as uncategorized", async () => {
    const empty = createService();
    await expect(empty.service.getSpendMix("u1", "1W")).resolves.toEqual({
      range: "1W",
      totalMinor: 0,
      essential: { amountMinor: 0, pct: 0 },
      lifestyle: { amountMinor: 0, pct: 0 },
      uncategorized: { amountMinor: 0, pct: 0 }
    });

    const unknown = createService({
      dashboard: {
        categoryTotals: vi
          .fn()
          .mockResolvedValue([
            { categoryId: CATEGORY_ID, spentMinor: 900, incomeMinor: 0, txnCount: 1 }
          ])
      }
    });
    await expect(unknown.service.getSpendMix("u1", "1W")).resolves.toMatchObject({
      uncategorized: { amountMinor: 900, pct: 100 }
    });
  });
});

describe("DashboardService investments and recurring forecast", () => {
  it("filters non-investments and covers empty, zero-opening, and profitable valuation histories", async () => {
    const assets = {
      list: vi.fn().mockResolvedValue([
        { id: "ignored", name: "Gold", kind: "gold" },
        { id: ASSET_ID, name: "Fund", kind: "investment" },
        { id: "423e4567-e89b-42d3-a456-426614174000", name: "FD", kind: "fixed_deposit" },
        { id: "523e4567-e89b-42d3-a456-426614174000", name: "Empty", kind: "investment" }
      ])
    };
    const valuations = {
      listByAsset: vi.fn().mockImplementation(async (_userId: string, assetId: string) => {
        if (assetId === ASSET_ID) {
          return [
            { valuedAt: new Date("2026-07-01"), valueMinor: 150_000 },
            { valuedAt: new Date("2026-01-01"), valueMinor: 100_000 }
          ];
        }
        if (assetId.startsWith("423")) {
          return [
            { valuedAt: new Date("2026-07-01"), valueMinor: 10_000 },
            { valuedAt: new Date("2026-01-01"), valueMinor: 0 }
          ];
        }
        return [];
      })
    };
    const context = createService({ assets, valuations });

    const result = await context.service.getInvestments("u1");

    expect(result.items).toHaveLength(3);
    expect(result.items.find((item) => item.assetId === ASSET_ID)).toMatchObject({
      currentValueMinor: 150_000,
      returnPct: 50
    });
    expect(result.items.find((item) => item.name === "FD")?.returnPct).toBeNull();
    expect(result.items.find((item) => item.name === "Empty")).toMatchObject({
      currentValueMinor: 0,
      returnPct: null,
      series: []
    });
  });

  it("forecasts active income and expense occurrences, decorates icons, sorts, and excludes paused rules", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const baseRule = {
      id: "rule-income",
      userId: "u1",
      template: {
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
        type: "income",
        amountMinor: 10_000,
        description: "Salary",
        tags: []
      },
      rrule: "FREQ=DAILY;COUNT=3",
      startAt: new Date("2026-07-15T00:00:00.000Z"),
      nextRunAt: new Date("2026-07-15T07:00:00.000Z"),
      isPaused: false,
      createdAt: NOW,
      updatedAt: NOW
    };
    const recurringRules = {
      list: vi.fn().mockResolvedValue([
        baseRule,
        {
          ...baseRule,
          id: "rule-expense",
          template: {
            ...baseRule.template,
            categoryId: undefined,
            type: "expense",
            amountMinor: 2_000,
            description: "Rent"
          },
          nextRunAt: new Date("2026-07-15T06:30:00.000Z")
        },
        { ...baseRule, id: "paused", isPaused: true }
      ])
    };
    const categories = {
      list: vi.fn().mockResolvedValue([{ id: CATEGORY_ID, icon: "wallet" }])
    };
    const context = createService({ recurringRules, categories });

    const result = await context.service.getRecurringForecast("u1", "1W");

    expect(result.inMinor).toBe(30_000);
    expect(result.outMinor).toBe(6_000);
    expect(result.netMinor).toBe(24_000);
    expect(result.upcoming).toHaveLength(6);
    expect(result.upcoming[0]).toMatchObject({ name: "Rent", type: "expense" });
    expect(result.upcoming.find((item) => item.name === "Salary")?.icon).toBe("wallet");
    expect(result.upcoming.find((item) => item.name === "Rent")).not.toHaveProperty("icon");
  });
});
