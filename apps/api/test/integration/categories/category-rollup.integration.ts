import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountInsightsRepository } from "../../../src/accounts/account-insights.repository.js";
import { buildAccountInsightsWindow } from "../../../src/accounts/account-insights-window.js";
import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AssetRepository } from "../../../src/assets/asset.repository.js";
import { ValuationRepository } from "../../../src/assets/valuation.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { BudgetAlertCron } from "../../../src/budgets/budget-alert.cron.js";
import { BudgetRepository } from "../../../src/budgets/budget.repository.js";
import { BudgetService } from "../../../src/budgets/budget.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryService } from "../../../src/categories/category.service.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  budgetAlertEvents,
  categories as categoriesTable,
  monthlyRollups,
  notificationOutbox
} from "../../../src/common/db/schema/index.js";
import { toISTMonth } from "../../../src/common/time/ist.js";
import { DashboardRepository } from "../../../src/dashboard/dashboard.repository.js";
import { DashboardService } from "../../../src/dashboard/dashboard.service.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { MonthlyReportService } from "../../../src/reports/monthly-report.service.js";
import { MonthlyRollupRepository } from "../../../src/reports/monthly-rollup.repository.js";
import { MonthlyRollupService } from "../../../src/reports/monthly-rollup.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { TransferService } from "../../../src/transactions/transfer.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };

type Tree = Readonly<{ transport: string; cab: string; uber: string; rent: string }>;

describe("category rollups across reports, dashboard and budgets", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let categoryRepo: CategoryRepository;
  let categoryService: CategoryService;
  let transactions: TransactionService;
  let transactionRepo: TransactionRepository;
  let transfers: TransferService;
  let budgetRepo: BudgetRepository;
  let budgets: BudgetService;
  let rollupRepo: MonthlyRollupRepository;
  let reports: MonthlyReportService;
  let dashboard: DashboardService;
  let insights: AccountInsightsRepository;
  let outbox: NotificationOutboxRepository;

  const month = (): string => toISTMonth(new Date());

  beforeAll(async () => {
    testDb = await createTestDb();

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/13";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts = new AccountRepository(testDb.db);
    categoryRepo = new CategoryRepository(testDb.db);
    categoryService = new CategoryService(categoryRepo);
    transactionRepo = new TransactionRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    transactions = new TransactionService(
      testDb.db,
      accounts,
      categoryRepo,
      transactionRepo,
      audit,
      NOOP_LOGGER
    );
    transfers = new TransferService(testDb.db, accounts, transactionRepo, audit, NOOP_LOGGER);
    budgetRepo = new BudgetRepository(testDb.db);
    budgets = new BudgetService(testDb.db, budgetRepo, categoryRepo, audit);
    rollupRepo = new MonthlyRollupRepository(testDb.db);
    const rollups = new MonthlyRollupService(rollupRepo);
    reports = new MonthlyReportService(rollups, categoryRepo);
    dashboard = new DashboardService(
      accounts,
      transactionRepo,
      categoryRepo,
      new AssetRepository(testDb.db),
      new ValuationRepository(testDb.db),
      new RecurringRuleRepository(testDb.db),
      rollups,
      new DashboardRepository(testDb.db)
    );
    insights = new AccountInsightsRepository(testDb.db);
    outbox = new NotificationOutboxRepository(testDb.db);
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function createUser(userId: string): Promise<string> {
    await insertTestUser(testDb.db, userId);
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(userId, { name: "Wallet", type: "cash", openingBalanceMinor: 0 }, tx)
    );
    return account.id;
  }

  async function createCategory(userId: string, name: string, parentId?: string): Promise<string> {
    const category = await categoryRepo.create(userId, {
      name,
      kind: "expense",
      ...(parentId === undefined ? {} : { parentId })
    });
    return category.id;
  }

  async function createTree(userId: string): Promise<Tree> {
    const transport = await createCategory(userId, "Transportation");
    const cab = await createCategory(userId, "Cab / Rideshare", transport);
    const uber = await createCategory(userId, "Uber", cab);
    const rent = await createCategory(userId, "Rent");
    return { transport, cab, uber, rent };
  }

  async function spend(
    userId: string,
    accountId: string,
    categoryId: string | undefined,
    amountMinor: number
  ): Promise<string> {
    const { transaction } = await transactions.create(
      userId,
      {
        accountId,
        ...(categoryId === undefined ? {} : { categoryId }),
        type: "expense",
        amountMinor,
        occurredAt: new Date(),
        description: "Spend",
        tags: []
      },
      undefined
    );
    return transaction.id;
  }

  /** 1,000 on Transportation, 2,000 on Cab, 5,000 on Uber, 9,000 on Rent, 500 uncategorized. */
  async function seedSpend(userId: string, accountId: string, tree: Tree): Promise<void> {
    await spend(userId, accountId, tree.transport, 1_000);
    await spend(userId, accountId, tree.cab, 2_000);
    await spend(userId, accountId, tree.uber, 5_000);
    await spend(userId, accountId, tree.rent, 9_000);
    await spend(userId, accountId, undefined, 500);
  }

  async function reportRows(userId: string): Promise<(string | number)[][]> {
    await rollupRepo.recompute(userId, month());
    const report = await reports.getReport(userId, month());
    return (report?.consumptionTree ?? []).map((node) => [
      node.name,
      node.depth,
      node.directSpentMinor,
      node.totalSpentMinor
    ]);
  }

  it("rolls three levels up in the monthly report with each child's own amount beneath", async () => {
    const accountId = await createUser("nested-report");
    const tree = await createTree("nested-report");
    await seedSpend("nested-report", accountId, tree);

    await expect(reportRows("nested-report")).resolves.toEqual([
      ["Rent", 0, 9_000, 9_000],
      ["Transportation", 0, 1_000, 8_000],
      ["Cab / Rideshare", 1, 2_000, 7_000],
      ["Uber", 2, 5_000, 5_000],
      ["Uncategorized", 0, 500, 500]
    ]);
  });

  it("keeps the existing exclusions out of rolled-up totals", async () => {
    const accountId = await createUser("nested-exclusions");
    const otherAccountId = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "nested-exclusions",
        { name: "Bank", type: "bank", openingBalanceMinor: 0 },
        tx
      )
    ).then((account) => account.id);
    const tree = await createTree("nested-exclusions");

    await spend("nested-exclusions", accountId, tree.uber, 700);
    const reversed = await spend("nested-exclusions", accountId, tree.uber, 300);
    await transactions.reverse("nested-exclusions", reversed);
    await transfers.create(
      "nested-exclusions",
      {
        fromAccountId: accountId,
        toAccountId: otherAccountId,
        amountMinor: 400,
        occurredAt: new Date(),
        description: "Move",
        tags: []
      },
      undefined
    );

    await expect(reportRows("nested-exclusions")).resolves.toContainEqual([
      "Transportation",
      0,
      0,
      700
    ]);
    const page = await budgets.list("nested-exclusions", { limit: 50, includeArchived: false });
    expect(page.overview.unbudgetedSpentMinor).toBe(700);
  });

  it("leaves every grand total exactly as it was when the same categories were flat", async () => {
    const userId = "nested-grand-totals";
    const accountId = await createUser(userId);
    const transport = await createCategory(userId, "Transportation");
    const cab = await createCategory(userId, "Cab / Rideshare");
    const uber = await createCategory(userId, "Uber");
    const rent = await createCategory(userId, "Rent");
    await seedSpend(userId, accountId, { transport, cab, uber, rent });
    await budgets.upsert(userId, rent, { limitMinor: 50_000 });

    const snapshot = async () => {
      const rollup = await rollupRepo.recompute(userId, month());
      const [mix, topLong, topShort, monthly, stats, page] = await Promise.all([
        dashboard.getSpendMix(userId, "1M"),
        dashboard.getTopSpending(userId, "6M", 20),
        dashboard.getTopSpending(userId, "1M", 20),
        dashboard.getMonthlySpending(userId),
        dashboard.getStats(userId, month()),
        budgets.list(userId, { limit: 50, includeArchived: false })
      ]);
      return {
        totalExpenseMinor: rollup.totalExpenseMinor,
        totalIncomeMinor: rollup.totalIncomeMinor,
        totalCashOutflowMinor: rollup.totalCashOutflowMinor,
        totalConsumptionMinor: rollup.totalConsumptionMinor,
        // Directly stored per-category rows do not move when the hierarchy does.
        consumptionByCategory: [...rollup.consumptionByCategory].sort(
          (left, right) => left.spentMinor - right.spentMinor
        ),
        spendMixTotal: mix.totalMinor,
        topLongTotal: topLong.reduce((sum, item) => sum + item.amountMinor, 0),
        topShortTotal: topShort.reduce((sum, item) => sum + item.amountMinor, 0),
        monthlySpending: monthly.totalMinor,
        statsSpent: stats.spent.valueMinor,
        statsIncome: stats.income.valueMinor,
        savingsRate: stats.savingsRate.valuePct,
        budgetSpentPlusUnbudgeted:
          page.overview.spentInBudgetedCategoriesMinor + page.overview.unbudgetedSpentMinor
      };
    };

    const flat = await snapshot();
    expect(flat.totalConsumptionMinor).toBe(17_500);
    expect(flat.topLongTotal).toBe(17_500);

    await categoryService.update(userId, cab, {
      name: "Cab / Rideshare",
      parentId: transport,
      icon: null,
      color: null
    });
    await categoryService.update(userId, uber, {
      name: "Uber",
      parentId: cab,
      icon: null,
      color: null
    });

    await expect(snapshot()).resolves.toEqual(flat);

    const top = await dashboard.getTopSpending(userId, "1M", 20);
    expect(top.map((item) => [item.name, item.amountMinor, item.directAmountMinor])).toEqual([
      ["Rent", 9_000, 9_000],
      ["Transportation", 8_000, 1_000],
      ["Uncategorized", 500, 500]
    ]);
    expect(top[1]?.children.map((node) => [node.name, node.depth, node.totalSpentMinor])).toEqual([
      ["Cab / Rideshare", 1, 7_000],
      ["Uber", 2, 5_000]
    ]);
  });

  it("applies a reparent on read without bumping or rewriting the stored rollup", async () => {
    const userId = "nested-reparent";
    const accountId = await createUser(userId);
    const parent = await createCategory(userId, "Parent");
    const child = await createCategory(userId, "Child");
    await spend(userId, accountId, child, 1_000);
    await rollupRepo.recompute(userId, month());
    const [before] = await testDb.db
      .select()
      .from(monthlyRollups)
      .where(and(eq(monthlyRollups.userId, userId), eq(monthlyRollups.month, month())));

    await categoryService.update(userId, child, {
      name: "Child",
      parentId: parent,
      icon: null,
      color: null
    });

    const report = await reports.getReport(userId, month());
    expect(report?.consumptionTree.map((node) => [node.name, node.totalSpentMinor])).toEqual([
      ["Parent", 1_000],
      ["Child", 1_000]
    ]);
    const [after] = await testDb.db
      .select()
      .from(monthlyRollups)
      .where(and(eq(monthlyRollups.userId, userId), eq(monthlyRollups.month, month())));
    expect(after).toEqual(before);
    expect(after?.formulaVersion).toBe(2);
  });

  it("reports parent and child budgets correctly without adding them together", async () => {
    const userId = "nested-budgets";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    await seedSpend(userId, accountId, tree);
    const limits = { transport: 20_000, cab: 10_000, uber: 6_000, rent: 8_000 };
    await budgets.upsert(userId, tree.transport, { limitMinor: limits.transport });
    await budgets.upsert(userId, tree.cab, { limitMinor: limits.cab });
    await budgets.upsert(userId, tree.uber, { limitMinor: limits.uber });
    await budgets.upsert(userId, tree.rent, { limitMinor: limits.rent });

    const page = await budgets.list(userId, { limit: 50, includeArchived: false });
    const spentBy = (id: string): number | undefined =>
      page.items.find((item) => item.category.id === id)?.spentMinor;

    expect(spentBy(tree.transport)).toBe(8_000);
    expect(spentBy(tree.cab)).toBe(7_000);
    expect(spentBy(tree.uber)).toBe(5_000);
    expect(spentBy(tree.rent)).toBe(9_000);
    expect(page.items.find((item) => item.category.id === tree.uber)?.state).toBe("approaching");
    expect(page.items.find((item) => item.category.id === tree.rent)?.state).toBe("reached");

    // Only the top-most budgets (Transportation, Rent) contribute money.
    expect(page.overview).toEqual({
      plannedMinor: limits.transport + limits.rent,
      spentInBudgetedCategoriesMinor: 8_000 + 9_000,
      remainingMinor: limits.transport + limits.rent - 17_000,
      unbudgetedSpentMinor: 500,
      activeBudgetCount: 4
    });
  });

  it("counts a parent's budget from its child, but a child's budget only from itself down", async () => {
    const userId = "nested-budget-scope";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    await budgets.upsert(userId, tree.cab, { limitMinor: 10_000 });
    await spend(userId, accountId, tree.transport, 4_000);
    await spend(userId, accountId, tree.uber, 3_000);

    const page = await budgets.list(userId, { limit: 50, includeArchived: false });
    expect(page.items[0]?.spentMinor).toBe(3_000);
    expect(page.overview.spentInBudgetedCategoriesMinor).toBe(3_000);
    expect(page.overview.unbudgetedSpentMinor).toBe(4_000);
  });

  it("alerts on a parent budget crossed by a child's spend, exactly once", async () => {
    const userId = "nested-alert";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    const budget = await budgets.upsert(userId, tree.transport, { limitMinor: 10_000 });
    await spend(userId, accountId, tree.uber, 8_500);

    process.env.SERVICE_ROLE = "worker";
    const cron = new BudgetAlertCron(
      testDb.db,
      new RuntimeConfigService(),
      budgetRepo,
      categoryRepo,
      outbox,
      NOOP_LOGGER
    );
    await cron.checkThresholds();
    await cron.checkThresholds();

    const events = await testDb.db
      .select()
      .from(budgetAlertEvents)
      .where(eq(budgetAlertEvents.budgetId, budget.id));
    expect(events.map((event) => [event.thresholdBps, event.spentMinor])).toEqual([[8_000, 8_500]]);
    const notifications = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.userId, userId));
    expect(notifications).toHaveLength(1);
  });

  it("keeps an archived child's history in its active parent's totals", async () => {
    const userId = "nested-archived-child";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    await seedSpend(userId, accountId, tree);
    await budgets.upsert(userId, tree.transport, { limitMinor: 20_000 });
    await budgets.upsert(userId, tree.uber, { limitMinor: 6_000 });

    await categoryService.archive(userId, tree.uber);

    await rollupRepo.recompute(userId, month());
    const report = await reports.getReport(userId, month());
    expect(
      report?.consumptionTree.map((node) => [node.name, node.totalSpentMinor, node.isArchived])
    ).toEqual([
      ["Rent", 9_000, false],
      ["Transportation", 8_000, false],
      ["Cab / Rideshare", 7_000, false],
      ["Uber", 5_000, true],
      ["Uncategorized", 500, false]
    ]);

    const page = await budgets.list(userId, { limit: 50, includeArchived: false });
    const byCategory = new Map(page.items.map((item) => [item.category.id, item]));
    // Its parent still counts it; its own budget is ineffective (existing rule).
    expect(byCategory.get(tree.transport)?.spentMinor).toBe(8_000);
    expect(byCategory.get(tree.uber)?.isEffective).toBe(false);
    expect(byCategory.get(tree.uber)?.spentMinor).toBe(0);
    expect(page.overview.plannedMinor).toBe(20_000);
    expect(page.overview.activeBudgetCount).toBe(1);

    const transport = (await dashboard.getTopSpending(userId, "6M", 20)).find(
      (item) => item.categoryId === tree.transport
    );
    expect(transport?.children.find((node) => node.name === "Uber")?.isArchived).toBe(true);
  });

  it("keeps an archived parent's history visible and out of budget coverage", async () => {
    const userId = "nested-archived-parent";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    await seedSpend(userId, accountId, tree);
    await budgets.upsert(userId, tree.transport, { limitMinor: 20_000 });
    const rollupBefore = await rollupRepo.recompute(userId, month());

    await categoryService.archive(userId, tree.transport);

    const rollupAfter = await rollupRepo.recompute(userId, month());
    expect(rollupAfter.totalConsumptionMinor).toBe(rollupBefore.totalConsumptionMinor);
    const report = await reports.getReport(userId, month());
    expect(
      report?.consumptionTree
        .filter((node) => node.isArchived)
        .map((node) => [node.name, node.depth, node.totalSpentMinor])
    ).toEqual([
      ["Transportation", 0, 8_000],
      ["Cab / Rideshare", 1, 7_000],
      ["Uber", 2, 5_000]
    ]);
    const roots = report?.consumptionTree.filter((node) => node.depth === 0) ?? [];
    expect(roots.reduce((sum, node) => sum + node.totalSpentMinor, 0)).toBe(
      rollupBefore.totalConsumptionMinor
    );

    const page = await budgets.list(userId, { limit: 50, includeArchived: false });
    expect(page.overview.plannedMinor).toBe(0);
    expect(page.overview.spentInBudgetedCategoriesMinor).toBe(0);
    expect(page.overview.unbudgetedSpentMinor).toBe(17_500);
  });

  it("never lets a descendant lookup cross users, even if a parent link points across", async () => {
    const accountA = await createUser("nested-tenant-a");
    const accountB = await createUser("nested-tenant-b");
    const treeA = await createTree("nested-tenant-a");
    const foreignChild = await createCategory("nested-tenant-b", "Foreign child");
    // No API path creates this link; force it to prove the scoping holds.
    await testDb.db
      .update(categoriesTable)
      .set({ parentId: treeA.transport })
      .where(eq(categoriesTable.id, foreignChild));

    await spend("nested-tenant-a", accountA, treeA.uber, 1_000);
    await spend("nested-tenant-b", accountB, foreignChild, 7_777);
    await budgets.upsert("nested-tenant-a", treeA.transport, { limitMinor: 50_000 });

    await expect(reportRows("nested-tenant-a")).resolves.toEqual([
      ["Transportation", 0, 0, 1_000],
      ["Cab / Rideshare", 1, 0, 1_000],
      ["Uber", 2, 1_000, 1_000]
    ]);
    const pageA = await budgets.list("nested-tenant-a", { limit: 50, includeArchived: false });
    expect(pageA.items[0]?.spentMinor).toBe(1_000);

    const listed = await transactionRepo.findMany("nested-tenant-a", {
      limit: 50,
      categoryId: treeA.transport,
      includeSubcategories: true
    });
    expect(listed.items.map((txn) => txn.amountMinor)).toEqual([1_000]);

    // User B's category is a root to B, and B cannot see A's tree through it.
    await expect(reportRows("nested-tenant-b")).resolves.toEqual([
      ["Foreign child", 0, 7_777, 7_777]
    ]);
    const fromB = await transactionRepo.findMany("nested-tenant-b", {
      limit: 50,
      categoryId: treeA.transport,
      includeSubcategories: true
    });
    expect(fromB.items).toEqual([]);
    const topB = await dashboard.getTopSpending("nested-tenant-b", "1M", 20);
    expect(topB.map((item) => [item.name, item.amountMinor])).toEqual([["Foreign child", 7_777]]);
  });

  it("survives a corrupt cycle and a missing parent without double counting", async () => {
    const userId = "nested-corrupt";
    const accountId = await createUser(userId);
    const first = await createCategory(userId, "First");
    const second = await createCategory(userId, "Second");
    const orphan = await createCategory(userId, "Orphan");
    await testDb.db
      .update(categoriesTable)
      .set({ parentId: second })
      .where(eq(categoriesTable.id, first));
    await testDb.db
      .update(categoriesTable)
      .set({ parentId: first })
      .where(eq(categoriesTable.id, second));
    await testDb.db
      .update(categoriesTable)
      .set({ parentId: "00000000-0000-4000-8000-00000000dead" })
      .where(eq(categoriesTable.id, orphan));

    await spend(userId, accountId, first, 100);
    await spend(userId, accountId, second, 200);
    await spend(userId, accountId, orphan, 400);
    await budgets.upsert(userId, first, { limitMinor: 1_000 });
    await budgets.upsert(userId, second, { limitMinor: 1_000 });

    const rollup = await rollupRepo.recompute(userId, month());
    const report = await reports.getReport(userId, month());
    const roots = report?.consumptionTree.filter((node) => node.depth === 0) ?? [];
    expect(roots.reduce((sum, node) => sum + node.totalSpentMinor, 0)).toBe(
      rollup.totalConsumptionMinor
    );
    expect(roots.find((node) => node.name === "Orphan")?.totalSpentMinor).toBe(400);

    const page = await budgets.list(userId, { limit: 50, includeArchived: false });
    expect(page.overview.spentInBudgetedCategoriesMinor + page.overview.unbudgetedSpentMinor).toBe(
      700
    );
    const total = (await dashboard.getTopSpending(userId, "1M", 20)).reduce(
      (sum, item) => sum + item.amountMinor,
      0
    );
    expect(total).toBe(700);

    // The cycle-hardened helper also stops archive and reparent from hanging.
    await expect(categoryService.archive(userId, first)).resolves.toBeUndefined();
  });

  it("widens the transaction filter to a subtree only when asked", async () => {
    const userId = "nested-filter";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    await seedSpend(userId, accountId, tree);

    const amounts = async (categoryId: string, includeSubcategories?: true): Promise<number[]> => {
      const page = await transactionRepo.findMany(userId, {
        limit: 50,
        categoryId,
        ...(includeSubcategories === undefined ? {} : { includeSubcategories })
      });
      return page.items.map((txn) => txn.amountMinor).sort((a, b) => a - b);
    };

    await expect(amounts(tree.transport)).resolves.toEqual([1_000]);
    await expect(amounts(tree.transport, true)).resolves.toEqual([1_000, 2_000, 5_000]);
    await expect(amounts(tree.cab, true)).resolves.toEqual([2_000, 5_000]);
    await expect(amounts(tree.rent, true)).resolves.toEqual([9_000]);
  });

  it("rolls account breakdowns and the top-category insight up to the root", async () => {
    const userId = "nested-account";
    const accountId = await createUser(userId);
    const tree = await createTree(userId);
    await seedSpend(userId, accountId, tree);
    const account = await accounts.findById(userId, accountId);
    if (account === null) throw new Error("Account fixture is missing.");
    const now = new Date();

    const result = await insights.get(
      userId,
      account,
      buildAccountInsightsWindow("30d", account.createdAt, now)
    );
    expect(
      result.spendingByCategory.map((item) => [
        item.name,
        item.amountMinor,
        item.directAmountMinor,
        item.children.map((child) => child.name)
      ])
    ).toEqual([
      ["Rent", 9_000, 9_000, []],
      ["Transportation", 8_000, 1_000, ["Cab / Rideshare", "Uber"]],
      ["Uncategorized", 500, 500, []]
    ]);
    expect(result.spendingByCategory.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(17_500);

    // Top is decided on rolled-up totals: Transportation overtakes Rent.
    await spend(userId, accountId, tree.uber, 2_000);
    const insight = await transactionRepo.getInsights(userId, month());
    expect(insight.topSpendingCategory).toMatchObject({
      categoryId: tree.transport,
      name: "Transportation",
      amountMinor: 10_000,
      transactionCount: 4
    });
  });
});
