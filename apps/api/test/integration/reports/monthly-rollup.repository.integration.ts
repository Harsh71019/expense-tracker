import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { monthlyRollups } from "../../../src/common/db/schema/index.js";
import { MonthlyRollupRepository } from "../../../src/reports/monthly-rollup.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";
import type { Transaction } from "@vyaya/shared";

describe("MonthlyRollupRepository", () => {
  let testDb: TestDb;
  let rollups: MonthlyRollupRepository;
  let transactions: TransactionRepository;
  let accountId: string;
  let foodCategoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");

    const accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    transactions = new TransactionRepository(testDb.db);
    rollups = new MonthlyRollupRepository(testDb.db);

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create("user-a", { name: "HDFC Savings", type: "bank", openingBalanceMinor: 0 }, tx)
    );
    accountId = account.id;
    const food = await categories.create("user-a", { name: "Food", kind: "expense" });
    foodCategoryId = food.id;

    // Clearly within August IST.
    await create({
      type: "expense",
      amountMinor: 1_000,
      occurredAt: "2026-08-15T09:00:00.000Z",
      categoryId: foodCategoryId,
      description: "Lunch"
    });
    await create({
      type: "income",
      amountMinor: 5_000,
      occurredAt: "2026-08-15T09:00:00.000Z",
      description: "Freelance"
    });
    // 2026-07-31T19:00:00Z + 5:30 = 2026-08-01T00:30 IST — rolls into August despite being a July UTC instant.
    await create({
      type: "expense",
      amountMinor: 200,
      occurredAt: "2026-07-31T19:00:00.000Z",
      categoryId: foodCategoryId,
      description: "Late night snack"
    });
    // Reversed pair: neither leg should count toward the rollup.
    const reversedOriginal = await create({
      type: "expense",
      amountMinor: 300,
      occurredAt: "2026-08-16T09:00:00.000Z",
      description: "Reversed purchase"
    });
    await withTxn(testDb.db, async (tx) => {
      const reversal = await transactions.createReversal("user-a", reversedOriginal, tx);
      await transactions.markReversed("user-a", reversedOriginal.id, reversal.id, tx);
    });
    // Outside the target month — must not be picked up.
    await create({
      type: "expense",
      amountMinor: 9_999,
      occurredAt: "2026-09-15T09:00:00.000Z",
      description: "September"
    });
    // Different user — must not be picked up.
    const otherAccount = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-b",
        { name: "Other User Account", type: "cash", openingBalanceMinor: 0 },
        tx
      )
    );
    await withTxn(testDb.db, (tx) =>
      transactions.create(
        "user-b",
        {
          accountId: otherAccount.id,
          type: "expense",
          amountMinor: 4_242,
          occurredAt: new Date("2026-08-15T09:00:00.000Z"),
          description: "Someone else's spend",
          tags: []
        },
        undefined,
        tx
      )
    );
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function create(input: {
    type: "expense" | "income";
    amountMinor: number;
    occurredAt: string;
    categoryId?: string;
    description: string;
  }): Promise<Transaction> {
    return withTxn(testDb.db, (tx) =>
      transactions.create(
        "user-a",
        {
          accountId,
          categoryId: input.categoryId,
          type: input.type,
          amountMinor: input.amountMinor,
          occurredAt: new Date(input.occurredAt),
          description: input.description,
          tags: []
        },
        undefined,
        tx
      )
    );
  }

  it("aggregates by category, by account, and totals for the IST month — excluding reversed pairs, other months, and other users", async () => {
    const rollup = await rollups.recompute("user-a", "2026-08");

    const food = rollup.byCategory.find((entry) => entry.categoryId === foodCategoryId);
    expect(food).toMatchObject({ spentMinor: 1_200, incomeMinor: 0, txnCount: 2 });

    const uncategorized = rollup.byCategory.find((entry) => entry.categoryId === undefined);
    expect(uncategorized).toMatchObject({ spentMinor: 0, incomeMinor: 5_000, txnCount: 1 });

    expect(rollup.byCategory.reduce((sum, entry) => sum + entry.txnCount, 0)).toBe(3);

    const account = rollup.byAccount.find((entry) => entry.accountId === accountId);
    expect(account?.netMinor).toBe(5_000 - 1_200);

    expect(rollup.totalExpenseMinor).toBe(1_200);
    expect(rollup.totalIncomeMinor).toBe(5_000);
    expect(rollup.month).toBe("2026-08");
  });

  it("persists the rollup so findByMonth reads it back", async () => {
    const found = await rollups.findByMonth("user-a", "2026-08");
    expect(found).toMatchObject({ totalExpenseMinor: 1_200, totalIncomeMinor: 5_000 });
  });

  it("findByMonth returns null for a month with no rollup yet", async () => {
    const found = await rollups.findByMonth("user-a", "2020-01");
    expect(found).toBeNull();
  });

  it("recompute is idempotent — re-running it upserts rather than duplicating", async () => {
    await rollups.recompute("user-a", "2026-08");
    await rollups.recompute("user-a", "2026-08");

    const rows = await testDb.db
      .select()
      .from(monthlyRollups)
      .where(and(eq(monthlyRollups.userId, "user-a"), eq(monthlyRollups.month, "2026-08")));
    expect(rows.length).toBe(1);
  });

  it("distinctUserIds includes every user with at least one posted transaction", async () => {
    const userIds = await rollups.distinctUserIds();
    expect(userIds).toEqual(expect.arrayContaining(["user-a", "user-b"]));
  });
});
