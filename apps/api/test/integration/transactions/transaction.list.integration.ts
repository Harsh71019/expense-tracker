import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("TransactionService.list", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let pgTestDb: TestDb | undefined;
  let transactions: TransactionService | undefined;
  let cashAccountId: string | undefined;
  let foodCategoryId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_transactions_list_test")
    ).asPromise();
    // categories is already Postgres-backed (Task 10); accounts/transactions/audit are
    // still Mongo (Tasks 11/14/12 not done yet) -- two separate test databases.
    pgTestDb = await createTestDb();
    await insertTestUser(pgTestDb.db, "user-a");
    const accountRepository = new AccountRepository(connection);
    const categoryRepository = new CategoryRepository(pgTestDb.db);
    transactions = new TransactionService(
      connection,
      accountRepository,
      categoryRepository,
      new TransactionRepository(connection),
      new AuditRepository(connection),
      { log: () => undefined, warn: () => undefined }
    );
    await connectedDatabase(connection)
      .collection("transactions")
      .createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });

    const hdfc = await withTxn(connectedConnection(connection), async (session) =>
      accountRepository.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        session
      )
    );

    const cash = await withTxn(connectedConnection(connection), async (session) =>
      accountRepository.create(
        "user-a",
        { name: "Cash", type: "cash", openingBalanceMinor: 5_000 },
        session
      )
    );
    cashAccountId = cash.id;

    const food = await categoryRepository.create("user-a", { name: "Food", kind: "expense" });
    foodCategoryId = food.id;

    const service = transactionService(transactions);
    const rows: Array<{
      accountId: string;
      categoryId?: string;
      description: string;
      occurredAt: string;
    }> = [
      {
        accountId: hdfc.id,
        categoryId: food.id,
        description: "Chai",
        occurredAt: "2026-07-01T09:00:00.000Z"
      },
      { accountId: hdfc.id, description: "Metro card", occurredAt: "2026-07-02T09:00:00.000Z" },
      {
        accountId: cash.id,
        categoryId: food.id,
        description: "Vada pav",
        occurredAt: "2026-07-03T09:00:00.000Z"
      },
      { accountId: hdfc.id, description: "Groceries", occurredAt: "2026-07-04T09:00:00.000Z" },
      { accountId: hdfc.id, description: "Chai again", occurredAt: "2026-07-05T09:00:00.000Z" }
    ];

    for (const [index, row] of rows.entries()) {
      const categoryId = row.categoryId === undefined ? {} : { categoryId: row.categoryId };
      await service.create(
        "user-a",
        {
          accountId: row.accountId,
          ...categoryId,
          type: "expense",
          amountMinor: 100,
          occurredAt: new Date(row.occurredAt),
          description: row.description,
          tags: []
        },
        `11111111-1111-4111-a111-11111111111${index}`
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
    if (pgTestDb !== undefined) await pgTestDb.teardown();
  });

  it("returns pages newest-first and paginates via cursor without gaps or duplicates", async () => {
    const service = transactionService(transactions);
    const firstPage = await service.list("user-a", { limit: 2 });
    expect(firstPage.items.map((t) => t.description)).toEqual(["Chai again", "Groceries"]);
    expect(firstPage.pageInfo).toMatchObject({ hasMore: true, limit: 2 });

    const secondPage = await service.list("user-a", {
      limit: 2,
      cursor: existingCursor(firstPage.pageInfo.nextCursor)
    });
    expect(secondPage.items.map((t) => t.description)).toEqual(["Vada pav", "Metro card"]);
    expect(secondPage.pageInfo).toMatchObject({ hasMore: true, limit: 2 });

    const thirdPage = await service.list("user-a", {
      limit: 2,
      cursor: existingCursor(secondPage.pageInfo.nextCursor)
    });
    expect(thirdPage.items.map((t) => t.description)).toEqual(["Chai"]);
    expect(thirdPage.pageInfo).toEqual({ nextCursor: null, hasMore: false, limit: 2 });
  });

  it("filters by accountId", async () => {
    const service = transactionService(transactions);
    const page = await service.list("user-a", {
      accountId: existingId(cashAccountId),
      limit: 50
    });
    expect(page.items.map((t) => t.description)).toEqual(["Vada pav"]);
  });

  it("filters by categoryId", async () => {
    const service = transactionService(transactions);
    const page = await service.list("user-a", {
      categoryId: existingId(foodCategoryId),
      limit: 50
    });
    expect(page.items.map((t) => t.description)).toEqual(["Vada pav", "Chai"]);
  });

  it("filters by case-insensitive description search", async () => {
    const service = transactionService(transactions);
    const page = await service.list("user-a", { q: "chai", limit: 50 });
    expect(page.items.map((t) => t.description)).toEqual(["Chai again", "Chai"]);
  });

  it("filters by occurredAt range", async () => {
    const service = transactionService(transactions);
    const page = await service.list("user-a", {
      from: new Date("2026-07-02T00:00:00.000Z"),
      to: new Date("2026-07-03T23:59:59.000Z"),
      limit: 50
    });
    expect(page.items.map((t) => t.description)).toEqual(["Vada pav", "Metro card"]);
  });

  it("rejects a malformed cursor", async () => {
    const service = transactionService(transactions);
    await expect(
      service.list("user-a", { cursor: "not-a-real-cursor", limit: 10 })
    ).rejects.toThrow("Invalid cursor.");
  });

  it("scopes results to the requesting user", async () => {
    const service = transactionService(transactions);
    const page = await service.list("other-user", { limit: 50 });
    expect(page.items).toEqual([]);
  });

  function existingId(id: string | undefined): string {
    if (id === undefined) throw new Error("Fixture id is not ready");
    return id;
  }
});

function existingCursor(cursor: string | null): string {
  if (cursor === null) throw new Error("Expected a next-page cursor");
  return cursor;
}

function transactionService(service: TransactionService | undefined): TransactionService {
  if (service === undefined) throw new Error("Transaction service is not ready");
  return service;
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
