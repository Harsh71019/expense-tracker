import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { AssetService } from "../../../src/assets/asset.service.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { toISTCalendarDate, toISTMonth } from "../../../src/common/time/ist.js";
import { DashboardRepository } from "../../../src/dashboard/dashboard.repository.js";
import { DashboardService } from "../../../src/dashboard/dashboard.service.js";
import { MonthlyRollupRepository } from "../../../src/reports/monthly-rollup.repository.js";
import { MonthlyRollupService } from "../../../src/reports/monthly-rollup.service.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("DashboardService", () => {
  let testDb: TestDb;
  let service: DashboardService;
  let accounts: AccountRepository;
  let transactions: TransactionRepository;
  let categories: CategoryRepository;
  let recurringRules: RecurringRuleRepository;
  let now: Date;

  let bankAccountId: string;
  let essentialCategoryId: string;
  let lifestyleCategoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");

    accounts = new AccountRepository(testDb.db);
    transactions = new TransactionRepository(testDb.db);
    categories = new CategoryRepository(testDb.db);
    const assetRepository = new AssetRepository(testDb.db);
    const valuations = new ValuationRepository(testDb.db);
    recurringRules = new RecurringRuleRepository(testDb.db);
    const rollups = new MonthlyRollupService(new MonthlyRollupRepository(testDb.db));
    const dashboardRepository = new DashboardRepository(testDb.db);

    service = new DashboardService(
      accounts,
      transactions,
      categories,
      assetRepository,
      valuations,
      recurringRules,
      rollups,
      dashboardRepository
    );

    now = new Date();

    const bank = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        tx
      )
    );
    bankAccountId = bank.id;
    await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "ICICI Card", type: "credit_card", openingBalanceMinor: -20_000 },
        tx
      )
    );

    const essential = await categories.create("user-a", { name: "Groceries", kind: "expense" });
    essentialCategoryId = essential.id;
    await categories.updateGroup("user-a", essential.id, { group: "essential" });
    const lifestyle = await categories.create("user-a", { name: "Dining out", kind: "expense" });
    lifestyleCategoryId = lifestyle.id;
    await categories.updateGroup("user-a", lifestyle.id, { group: "lifestyle" });

    // Today, within the 1W/1M windows.
    await postTxn({
      accountId: bankAccountId,
      categoryId: essentialCategoryId,
      type: "expense",
      amountMinor: 1_500,
      occurredAt: now,
      description: "Groceries today"
    });
    await postTxn({
      accountId: bankAccountId,
      categoryId: lifestyleCategoryId,
      type: "expense",
      amountMinor: 800,
      occurredAt: now,
      description: "Dinner today"
    });
    // 10 days ago -- outside the 1W window, inside 1M.
    await postTxn({
      accountId: bankAccountId,
      categoryId: essentialCategoryId,
      type: "expense",
      amountMinor: 2_000,
      occurredAt: new Date(now.getTime() - 10 * ONE_DAY_MS),
      description: "Groceries 10 days ago"
    });

    // A fixed-deposit asset with two valuations, for the investments panel.
    const assetService = new AssetService(
      testDb.db,
      assetRepository,
      valuations,
      new AuditRepository(testDb.db)
    );
    await withTxn(testDb.db, async (tx) => {
      const fd = await assetService.createInTx(
        "user-a",
        {
          kind: "fixed_deposit",
          name: "HDFC FD",
          openedAt: new Date(now.getTime() - 200 * ONE_DAY_MS),
          openingValueMinor: 50_000
        },
        tx
      );
      await assetService.addValuationInTx(
        "user-a",
        fd.id,
        { valueMinor: 55_000, valuedAt: now, source: "manual" },
        tx
      );
    });

    // A single-occurrence rule due in 3 days, within a 1M forecast window.
    // COUNT=1 with dtstart pinned to the due date itself guarantees exactly
    // one occurrence, regardless of real calendar alignment when the suite
    // runs -- a BYMONTHDAY-based rule's stored nextRunAt has to actually
    // agree with the rrule's real occurrence pattern, or the forecast walk
    // (which advances via computeNextOccurrence from nextRunAt) recounts the
    // rule's *next* real occurrence on top of the mismatched one.
    const rentDueAt = new Date(now.getTime() + 3 * ONE_DAY_MS);
    await withTxn(testDb.db, (tx) =>
      recurringRules.create(
        "user-a",
        {
          template: {
            accountId: bankAccountId,
            categoryId: essentialCategoryId,
            type: "expense",
            amountMinor: 12_000,
            description: "Rent",
            tags: []
          },
          rrule: "FREQ=DAILY;COUNT=1",
          startAt: rentDueAt
        },
        rentDueAt,
        tx
      )
    );
    // A single-occurrence rule due far outside the 1M window.
    const bonusDueAt = new Date(now.getTime() + 200 * ONE_DAY_MS);
    await withTxn(testDb.db, (tx) =>
      recurringRules.create(
        "user-a",
        {
          template: {
            accountId: bankAccountId,
            type: "income",
            amountMinor: 500_00,
            description: "Annual bonus",
            tags: []
          },
          rrule: "FREQ=DAILY;COUNT=1",
          startAt: bonusDueAt
        },
        bonusDueAt,
        tx
      )
    );
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function postTxn(input: {
    accountId: string;
    categoryId?: string;
    type: "expense" | "income";
    amountMinor: number;
    occurredAt: Date;
    description: string;
  }): Promise<void> {
    const deltaMinor = input.type === "income" ? input.amountMinor : -input.amountMinor;
    await withTxn(testDb.db, async (tx) => {
      await accounts.applyBalanceDelta("user-a", input.accountId, deltaMinor, tx);
      await transactions.create(
        "user-a",
        {
          accountId: input.accountId,
          categoryId: input.categoryId,
          type: input.type,
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          description: input.description,
          tags: []
        },
        undefined,
        tx
      );
    });
  }

  describe("getSummary", () => {
    it("splits accounts into assets and liabilities by balance sign", async () => {
      const summary = await service.getSummary("user-a");
      expect(summary.activeAccountCount).toBe(2);
      // Bank: 100_000 - 1_500 - 800 - 2_000 = 95_700. Card: -20_000 (never paid).
      expect(summary.totalBalanceMinor).toBe(95_700 - 20_000);
      expect(summary.assetsMinor).toBe(95_700);
      expect(summary.liabilitiesMinor).toBe(20_000);
    });

    it("scopes to the requesting user only", async () => {
      const summary = await service.getSummary("user-b");
      expect(summary.activeAccountCount).toBe(0);
      expect(summary.totalBalanceMinor).toBe(0);
    });
  });

  describe("getRecentActivity", () => {
    it("returns the most recent posted transactions with account names resolved", async () => {
      const activity = await service.getRecentActivity("user-a", 2);
      expect(activity).toHaveLength(2);
      expect(activity[0]?.accountName).toBe("HDFC Savings");
      expect(activity.every((item) => item.accountId === bankAccountId)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("computes spent/income/savingsRate/netWorth for a fixed past period, independent of real time", async () => {
      // Deliberately far in the past relative to whenever this suite runs, so the
      // 6-month trailing window never touches the real current month and the
      // netWorth trend uses pure historical reconstruction throughout.
      const stats = await service.getStats("user-a", "2020-06");
      expect(stats.period).toBe("2020-06");
      expect(stats.spent.trend).toHaveLength(6);
      expect(stats.spent.valueMinor).toBe(0);
      expect(stats.income.valueMinor).toBe(0);
      expect(stats.savingsRate.valuePct).toBe(0);
      expect(stats.netWorth.valueMinor).toBe(0);
      expect(stats.netWorth.deltaPct).toBeNull();
    });
  });

  describe("getCashflow", () => {
    it("1W includes today's spend but not spend from 10 days ago", async () => {
      const cashflow = await service.getCashflow("user-a", "1W");
      expect(cashflow.buckets).toHaveLength(7);
      const todayKey = toISTCalendarDate(now);
      const todayBucket = cashflow.buckets.find((bucket) => bucket.label === todayKey);
      expect(todayBucket?.expenseMinor).toBe(2_300);
    });

    it("1M's daily window includes both today's and 10-days-ago spend", async () => {
      const cashflow = await service.getCashflow("user-a", "1M");
      const totalExpense = cashflow.buckets.reduce((sum, bucket) => sum + bucket.expenseMinor, 0);
      expect(totalExpense).toBeGreaterThanOrEqual(2_300 + 2_000);
    });

    it("6M returns one bucket per month, ending at the current IST month", async () => {
      const cashflow = await service.getCashflow("user-a", "6M");
      expect(cashflow.buckets).toHaveLength(6);
      expect(cashflow.buckets.at(-1)?.label).toBe(toISTMonth(new Date()));
    });
  });

  describe("getTopSpending", () => {
    it("ranks categories by spend within the range, descending", async () => {
      const top = await service.getTopSpending("user-a", "1W", 5);
      expect(top[0]?.name).toBe("Groceries");
      expect(top[0]?.amountMinor).toBe(1_500);
    });
  });

  describe("getSpendMix", () => {
    it("splits spend into essential/lifestyle/uncategorized buckets", async () => {
      const mix = await service.getSpendMix("user-a", "1W");
      expect(mix.essential.amountMinor).toBe(1_500);
      expect(mix.lifestyle.amountMinor).toBe(800);
      expect(mix.uncategorized.amountMinor).toBe(0);
      expect(mix.totalMinor).toBe(2_300);
      expect(mix.essential.pct).toBeCloseTo((1_500 / 2_300) * 100, 5);
    });
  });

  describe("getInvestments", () => {
    it("returns the valuation series and computed return for fixed-deposit/investment assets", async () => {
      const investments = await service.getInvestments("user-a");
      expect(investments.items).toHaveLength(1);
      const fd = investments.items[0];
      expect(fd?.name).toBe("HDFC FD");
      expect(fd?.currentValueMinor).toBe(55_000);
      expect(fd?.returnPct).toBeCloseTo(10, 5);
      expect(fd?.series).toHaveLength(2);
      expect(fd?.series[0]?.valueMinor).toBe(50_000);
      expect(fd?.series[1]?.valueMinor).toBe(55_000);
    });
  });

  describe("getRecurringForecast", () => {
    it("includes a rule due within the window and excludes one due far outside it", async () => {
      const forecast = await service.getRecurringForecast("user-a", "1M");
      expect(forecast.outMinor).toBe(12_000);
      expect(forecast.inMinor).toBe(0);
      expect(forecast.upcoming).toHaveLength(1);
      expect(forecast.upcoming[0]?.name).toBe("Rent");
    });

    it("a wider range picks up the yearly rule too", async () => {
      const forecast = await service.getRecurringForecast("user-a", "12M");
      expect(forecast.inMinor).toBe(500_00);
      expect(forecast.outMinor).toBeGreaterThanOrEqual(12_000);
    });
  });
});
