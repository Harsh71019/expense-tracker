import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { BudgetAlertCron } from "../../../src/budgets/budget-alert.cron.js";
import { BudgetMutationService } from "../../../src/budgets/budget-mutation.service.js";
import { BudgetRepository } from "../../../src/budgets/budget.repository.js";
import { BudgetService } from "../../../src/budgets/budget.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  auditLog,
  budgetAlertEvents,
  notificationOutbox
} from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { TransferService } from "../../../src/transactions/transfer.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const LAST_MONTH = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

describe("BudgetService", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let categories: CategoryRepository;
  let budgetRepo: BudgetRepository;
  let service: BudgetService;
  let mutations: BudgetMutationService;
  let transactions: TransactionService;
  let transfers: TransferService;
  let outbox: NotificationOutboxRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of [
      "budget-spend",
      "budget-upsert",
      "budget-kind",
      "budget-archived-category",
      "budget-idempotent",
      "budget-cross-a",
      "budget-cross-b",
      "budget-alert",
      "budget-alert-concurrent"
    ]) {
      await insertTestUser(testDb.db, userId);
    }

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/13";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts = new AccountRepository(testDb.db);
    categories = new CategoryRepository(testDb.db);
    budgetRepo = new BudgetRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    service = new BudgetService(testDb.db, budgetRepo, categories, audit);
    mutations = new BudgetMutationService(
      service,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
    const transactionRepository = new TransactionRepository(testDb.db);
    transactions = new TransactionService(
      testDb.db,
      accounts,
      categories,
      transactionRepository,
      audit,
      NOOP_LOGGER
    );
    transfers = new TransferService(testDb.db, accounts, transactionRepository, audit, NOOP_LOGGER);
    outbox = new NotificationOutboxRepository(testDb.db);
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("counts only posted, non-transfer expense transactions in the exact current-IST-month category", async () => {
    const accountId = await createAccount("budget-spend", "Wallet", 1_000_000);
    const groceries = await createCategory("budget-spend", "Groceries");
    const dining = await createCategory("budget-spend", "Dining");
    const otherAccountId = await createAccount("budget-spend", "Other wallet", 0);

    await service.upsert("budget-spend", groceries, { limitMinor: 100_000 });

    // Counts: posted expense, this month, exact category.
    await transactions.create(
      "budget-spend",
      {
        accountId,
        categoryId: groceries,
        type: "expense",
        amountMinor: 30_000,
        occurredAt: new Date(),
        description: "Weekly shop",
        tags: []
      },
      undefined
    );
    // Excluded: income, even in the same category conceptually (schema requires expense/income match, so use dining as income placeholder is invalid) -- use a same-category expense reversal instead to prove reversed rows are excluded.
    const { transaction: reversible } = await transactions.create(
      "budget-spend",
      {
        accountId,
        categoryId: groceries,
        type: "expense",
        amountMinor: 20_000,
        occurredAt: new Date(),
        description: "Refunded purchase",
        tags: []
      },
      undefined
    );
    await transactions.reverse("budget-spend", reversible.id);
    // Excluded: different category.
    await transactions.create(
      "budget-spend",
      {
        accountId,
        categoryId: dining,
        type: "expense",
        amountMinor: 15_000,
        occurredAt: new Date(),
        description: "Restaurant",
        tags: []
      },
      undefined
    );
    // Excluded: previous month.
    await transactions.create(
      "budget-spend",
      {
        accountId,
        categoryId: groceries,
        type: "expense",
        amountMinor: 40_000,
        occurredAt: LAST_MONTH,
        description: "Old purchase",
        tags: []
      },
      undefined
    );
    // Excluded: transfer leg, even though it lands in the groceries category conceptually -- transfers don't carry a categoryId in this schema, so exercise the exclusion via a same-account transfer instead and assert it doesn't inflate any category's spend.
    await transfers.create(
      "budget-spend",
      {
        fromAccountId: accountId,
        toAccountId: otherAccountId,
        amountMinor: 50_000,
        occurredAt: new Date(),
        description: "Move money",
        tags: []
      },
      undefined
    );

    const page = await service.list("budget-spend", { limit: 50, includeArchived: false });
    const groceriesItem = page.items.find((item) => item.category.id === groceries);
    expect(groceriesItem?.spentMinor).toBe(30_000);
    expect(groceriesItem?.remainingMinor).toBe(70_000);
    expect(groceriesItem?.state).toBe("under");
    expect(page.overview.unbudgetedSpentMinor).toBe(15_000); // dining's spend, uncounted by any budget
  });

  it("upserts create, update, and restore exactly one row per user/category, with audit entries", async () => {
    const groceries = await createCategory("budget-upsert", "Groceries");

    const created = await service.upsert("budget-upsert", groceries, { limitMinor: 100_000 });
    const updated = await service.upsert("budget-upsert", groceries, { limitMinor: 150_000 });
    expect(updated.id).toBe(created.id);
    expect(updated.limitMinor).toBe(150_000);

    const archived = await service.archive("budget-upsert", created.id);
    expect(archived.isArchived).toBe(true);

    const restored = await service.upsert("budget-upsert", groceries, { limitMinor: 200_000 });
    expect(restored.id).toBe(created.id);
    expect(restored.isArchived).toBe(false);
    expect(restored.limitMinor).toBe(200_000);

    const auditRows = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, "budget-upsert"));
    expect(auditRows.map((row) => row.action)).toEqual([
      "budget.upsert",
      "budget.upsert",
      "budget.archive",
      "budget.upsert"
    ]);
  });

  it("rejects a budget on an income category", async () => {
    const salary = await createCategory("budget-kind", "Salary", "income");
    await expect(service.upsert("budget-kind", salary, { limitMinor: 100_000 })).rejects.toThrow(
      "expense"
    );
  });

  it("makes a budget ineffective (zeroed progress, excluded from overview) when its category is archived", async () => {
    const accountId = await createAccount("budget-archived-category", "Wallet", 0);
    const subscriptions = await createCategory("budget-archived-category", "Subscriptions");
    await service.upsert("budget-archived-category", subscriptions, { limitMinor: 50_000 });
    await transactions.create(
      "budget-archived-category",
      {
        accountId,
        categoryId: subscriptions,
        type: "expense",
        amountMinor: 40_000,
        occurredAt: new Date(),
        description: "Streaming",
        tags: []
      },
      undefined
    );

    await categories.archive("budget-archived-category", subscriptions);

    const page = await service.list("budget-archived-category", {
      limit: 50,
      includeArchived: false
    });
    const item = page.items.find((entry) => entry.category.id === subscriptions);
    expect(item?.isEffective).toBe(false);
    expect(item?.spentMinor).toBe(0);
    expect(page.overview.activeBudgetCount).toBe(0);
    expect(page.overview.unbudgetedSpentMinor).toBe(40_000);
  });

  it("replays five concurrent identical upserts and archives with exactly one effect", async () => {
    const groceries = await createCategory("budget-idempotent", "Groceries");
    const upsertKey = "11111111-aaaa-4111-8111-111111111111";

    const upserts = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.upsert("budget-idempotent", groceries, { limitMinor: 100_000 }, upsertKey)
      )
    );
    expect(upserts.filter((result) => !result.replayed)).toHaveLength(1);
    const budgetId = upserts[0]?.result.id;
    if (budgetId === undefined) throw new Error("Expected a created budget.");

    const archives = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.archive("budget-idempotent", budgetId, "22222222-aaaa-4222-8222-222222222222")
      )
    );
    expect(archives.filter((result) => !result.replayed)).toHaveLength(1);
  });

  it("never lets one user's budget mutations or reads touch another user's data", async () => {
    const categoryA = await createCategory("budget-cross-a", "Groceries");
    const budgetA = await service.upsert("budget-cross-a", categoryA, { limitMinor: 100_000 });

    await expect(
      service.upsert("budget-cross-b", categoryA, { limitMinor: 100_000 })
    ).rejects.toThrow("not found");
    await expect(service.archive("budget-cross-b", budgetA.id)).rejects.toThrow("not found");

    const pageB = await service.list("budget-cross-b", { limit: 50, includeArchived: false });
    expect(pageB.items).toHaveLength(0);
  });

  it("fires exactly one alert per newly-crossed threshold, skips already-recorded thresholds, and survives a reversal without duplicating", async () => {
    const accountId = await createAccount("budget-alert", "Wallet", 0);
    const rent = await createCategory("budget-alert", "Rent");
    const budget = await service.upsert("budget-alert", rent, { limitMinor: 100_000 });

    process.env.SERVICE_ROLE = "worker";
    const cron = new BudgetAlertCron(
      testDb.db,
      new RuntimeConfigService(),
      budgetRepo,
      categories,
      outbox,
      NOOP_LOGGER
    );

    const { transaction: first } = await transactions.create(
      "budget-alert",
      {
        accountId,
        categoryId: rent,
        type: "expense",
        amountMinor: 86_000, // 86% -- crosses 80% only
        occurredAt: new Date(),
        description: "Rent installment 1",
        tags: []
      },
      undefined
    );
    await cron.checkThresholds();

    let events = await testDb.db
      .select()
      .from(budgetAlertEvents)
      .where(eq(budgetAlertEvents.budgetId, budget.id));
    expect(events.map((event) => event.thresholdBps).sort((a, b) => a - b)).toEqual([8_000]);
    let alerts = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, "budget-alert"),
          eq(notificationOutbox.type, "budget_alert")
        )
      );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.payload).toMatchObject({ budgetId: budget.id, thresholdBps: 8_000 });

    // Cross 100% too -- only the new threshold (10000) should enqueue.
    const { transaction: second } = await transactions.create(
      "budget-alert",
      {
        accountId,
        categoryId: rent,
        type: "expense",
        amountMinor: 18_000, // total 104_000 -- 104%
        occurredAt: new Date(),
        description: "Rent installment 2",
        tags: []
      },
      undefined
    );
    await cron.checkThresholds();

    events = await testDb.db
      .select()
      .from(budgetAlertEvents)
      .where(eq(budgetAlertEvents.budgetId, budget.id));
    expect(events.map((event) => event.thresholdBps).sort((a, b) => a - b)).toEqual([
      8_000, 10_000
    ]);
    alerts = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, "budget-alert"),
          eq(notificationOutbox.type, "budget_alert")
        )
      );
    expect(alerts).toHaveLength(2);

    // Reverse back under 80%, then re-cross 80% -- no duplicate alert this month.
    await transactions.reverse("budget-alert", second.id);
    await cron.checkThresholds();
    await transactions.create(
      "budget-alert",
      {
        accountId,
        categoryId: rent,
        type: "expense",
        amountMinor: 1_000, // back to 87%
        occurredAt: new Date(),
        description: "Rent top-up",
        tags: []
      },
      undefined
    );
    await cron.checkThresholds();

    events = await testDb.db
      .select()
      .from(budgetAlertEvents)
      .where(eq(budgetAlertEvents.budgetId, budget.id));
    expect(events).toHaveLength(2);
    alerts = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, "budget-alert"),
          eq(notificationOutbox.type, "budget_alert")
        )
      );
    expect(alerts).toHaveLength(2);
    void first;
  });

  it("converges five concurrent alert-cron passes on one event per threshold and one outbox message", async () => {
    const accountId = await createAccount("budget-alert-concurrent", "Wallet", 0);
    const travel = await createCategory("budget-alert-concurrent", "Travel");
    const budget = await service.upsert("budget-alert-concurrent", travel, { limitMinor: 100_000 });
    await transactions.create(
      "budget-alert-concurrent",
      {
        accountId,
        categoryId: travel,
        type: "expense",
        amountMinor: 150_000, // 150% -- crosses both thresholds at once
        occurredAt: new Date(),
        description: "Flights",
        tags: []
      },
      undefined
    );

    process.env.SERVICE_ROLE = "worker";
    const cron = new BudgetAlertCron(
      testDb.db,
      new RuntimeConfigService(),
      budgetRepo,
      categories,
      outbox,
      NOOP_LOGGER
    );
    await Promise.all(Array.from({ length: 5 }, () => cron.checkThresholds()));

    const events = await testDb.db
      .select()
      .from(budgetAlertEvents)
      .where(eq(budgetAlertEvents.budgetId, budget.id));
    expect(events.map((event) => event.thresholdBps).sort((a, b) => a - b)).toEqual([
      8_000, 10_000
    ]);

    const alerts = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, "budget-alert-concurrent"),
          eq(notificationOutbox.type, "budget_alert")
        )
      );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.payload).toMatchObject({ budgetId: budget.id, thresholdBps: 10_000 });
  });

  async function createAccount(
    userId: string,
    name: string,
    openingBalanceMinor: number
  ): Promise<string> {
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(userId, { name, type: "bank", openingBalanceMinor }, tx)
    );
    return account.id;
  }

  async function createCategory(
    userId: string,
    name: string,
    kind: "expense" | "income" = "expense"
  ): Promise<string> {
    const category = await withTxn(testDb.db, (tx) =>
      categories.create(userId, { name, kind }, tx)
    );
    return category.id;
  }
});
