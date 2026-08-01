import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("TransactionRepository.getInsights", () => {
  let testDb: TestDb;
  let repository: TransactionRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await Promise.all([insertTestUser(testDb.db, "user-a"), insertTestUser(testDb.db, "user-b")]);

    const accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    repository = new TransactionRepository(testDb.db);
    const service = new TransactionService(
      testDb.db,
      accounts,
      categories,
      repository,
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined }
    );

    const accountA = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "User A cash", type: "cash", openingBalanceMinor: 100_000 },
        tx
      )
    );
    const accountB = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-b",
        { name: "User B cash", type: "cash", openingBalanceMinor: 100_000 },
        tx
      )
    );
    const food = await categories.create("user-a", {
      name: "Food",
      kind: "expense",
      color: "#16a34a",
      icon: "F"
    });
    const travel = await categories.create("user-a", { name: "Travel", kind: "expense" });

    const userATransactions = [
      {
        categoryId: food.id,
        type: "expense" as const,
        amountMinor: 1_000,
        occurredAt: "2026-08-01T18:40:00.000Z",
        description: "Late chai"
      },
      {
        categoryId: food.id,
        type: "expense" as const,
        amountMinor: 5_000,
        occurredAt: "2026-08-02T09:00:00.000Z",
        description: "Groceries"
      },
      {
        categoryId: travel.id,
        type: "expense" as const,
        amountMinor: 4_000,
        occurredAt: "2026-08-03T09:00:00.000Z",
        description: "Train"
      },
      {
        type: "income" as const,
        amountMinor: 20_000,
        occurredAt: "2026-08-03T10:00:00.000Z",
        description: "Refund"
      },
      {
        type: "expense" as const,
        amountMinor: 750,
        occurredAt: "2026-07-20T09:00:00.000Z",
        description: "Previous month"
      }
    ];

    for (const [index, transaction] of userATransactions.entries()) {
      await service.create(
        "user-a",
        {
          accountId: accountA.id,
          ...transaction,
          occurredAt: new Date(transaction.occurredAt),
          tags: []
        },
        `22222222-2222-4222-a222-22222222222${index}`
      );
    }

    await service.create(
      "user-b",
      {
        accountId: accountB.id,
        type: "expense",
        amountMinor: 90_000,
        occurredAt: new Date("2026-08-02T09:00:00.000Z"),
        description: "Other tenant expense",
        tags: []
      },
      "33333333-3333-4333-a333-333333333333"
    );
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns current-month activity, spending leaders, and a lifetime count", async () => {
    const insights = await repository.getInsights("user-a", "2026-08");

    expect(insights.monthlyTransactionCount).toBe(4);
    expect(insights.lifetimeTransactionCount).toBe(5);
    expect(insights.dailyActivity).toHaveLength(31);
    expect(insights.dailyActivity.find((day) => day.date === "2026-08-02")?.transactionCount).toBe(
      2
    );
    expect(insights.highestExpense).toMatchObject({
      description: "Groceries",
      amountMinor: 5_000
    });
    expect(insights.topSpendingCategory).toMatchObject({
      categoryId: expect.any(String),
      name: "Food",
      color: "#16a34a",
      icon: "F",
      amountMinor: 6_000,
      transactionCount: 2
    });
  });

  it("never exposes another tenant's insight data", async () => {
    const insights = await repository.getInsights("missing-user", "2026-08");

    expect(insights).toMatchObject({
      monthlyTransactionCount: 0,
      highestExpense: null,
      topSpendingCategory: null,
      lifetimeTransactionCount: 0
    });
  });
});
