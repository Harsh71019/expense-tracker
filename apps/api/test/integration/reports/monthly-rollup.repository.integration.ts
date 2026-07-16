import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { MonthlyRollupRepository } from "../../../src/reports/monthly-rollup.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import type { Transaction } from "@vyaya/shared";

describe("MonthlyRollupRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let rollups: MonthlyRollupRepository | undefined;
  let transactions: TransactionRepository | undefined;
  let accountId: string | undefined;
  let foodCategoryId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_rollups_test")).asPromise();
    const accounts = new AccountRepository(connection);
    const categories = new CategoryRepository(connection);
    transactions = new TransactionRepository(connection);
    rollups = new MonthlyRollupRepository(connection);

    const account = await withTxn(connectedConnection(connection), (session) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 0 },
        session
      )
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
    await withTxn(connectedConnection(connection), async (session) => {
      const reversal = await transactionRepository(transactions).createReversal(
        "user-a",
        reversedOriginal,
        session
      );
      await transactionRepository(transactions).markReversed(
        "user-a",
        reversedOriginal.id,
        reversal.id,
        session
      );
    });
    // Outside the target month — must not be picked up.
    await create({
      type: "expense",
      amountMinor: 9_999,
      occurredAt: "2026-09-15T09:00:00.000Z",
      description: "September"
    });
    // Different user — must not be picked up.
    await withTxn(connectedConnection(connection), (session) =>
      accounts.create(
        "user-b",
        { name: "Other User Account", type: "cash", openingBalanceMinor: 0 },
        session
      )
    ).then(async (otherAccount) => {
      await withTxn(connectedConnection(connection), (session) =>
        transactionRepository(transactions).create(
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
          session
        )
      );
    });
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  async function create(input: {
    type: "expense" | "income";
    amountMinor: number;
    occurredAt: string;
    categoryId?: string;
    description: string;
  }): Promise<Transaction> {
    return withTxn(connectedConnection(connection), (session) =>
      transactionRepository(transactions).create(
        "user-a",
        {
          accountId: requireId(accountId),
          categoryId: input.categoryId,
          type: input.type,
          amountMinor: input.amountMinor,
          occurredAt: new Date(input.occurredAt),
          description: input.description,
          tags: []
        },
        undefined,
        session
      )
    );
  }

  it("aggregates by category, by account, and totals for the IST month — excluding reversed pairs, other months, and other users", async () => {
    const rollup = await monthlyRollupRepository(rollups).recompute("user-a", "2026-08");

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
    const found = await monthlyRollupRepository(rollups).findByMonth("user-a", "2026-08");
    expect(found).toMatchObject({ totalExpenseMinor: 1_200, totalIncomeMinor: 5_000 });
  });

  it("findByMonth returns null for a month with no rollup yet", async () => {
    const found = await monthlyRollupRepository(rollups).findByMonth("user-a", "2020-01");
    expect(found).toBeNull();
  });

  it("recompute is idempotent — re-running it upserts rather than duplicating", async () => {
    await monthlyRollupRepository(rollups).recompute("user-a", "2026-08");
    await monthlyRollupRepository(rollups).recompute("user-a", "2026-08");

    const count = await connectedDatabase(connection)
      .collection("monthly_rollups")
      .countDocuments({ userId: "user-a", month: "2026-08" });
    expect(count).toBe(1);
  });

  it("distinctUserIds includes every user with at least one posted transaction", async () => {
    const userIds = await monthlyRollupRepository(rollups).distinctUserIds();
    expect(userIds).toEqual(expect.arrayContaining(["user-a", "user-b"]));
  });
});

function monthlyRollupRepository(
  repository: MonthlyRollupRepository | undefined
): MonthlyRollupRepository {
  if (repository === undefined) throw new Error("Monthly rollup repository is not ready");
  return repository;
}

function transactionRepository(
  repository: TransactionRepository | undefined
): TransactionRepository {
  if (repository === undefined) throw new Error("Transaction repository is not ready");
  return repository;
}

function requireId(id: string | undefined): string {
  if (id === undefined) throw new Error("Fixture id is not ready");
  return id;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  return connection;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = connectedConnection(connection).db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}
