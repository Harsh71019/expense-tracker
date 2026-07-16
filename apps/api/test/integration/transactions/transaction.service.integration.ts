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
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../../../src/common/errors/transaction-not-reversible.error.js";

describe("TransactionService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let transactions: TransactionService | undefined;
  let accountId: string | undefined;
  let categoryRepository: CategoryRepository | undefined;
  let foodCategoryId: string | undefined;
  let travelCategoryId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_transactions_test")).asPromise();
    const accountRepository = new AccountRepository(connection);
    categoryRepository = new CategoryRepository(connection);
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
    await connectedDatabase(connection)
      .collection("transactions")
      .createIndex({ reversalOf: 1 }, { unique: true, sparse: true });
    const account = await withTxn(connectedConnection(connection), async (session) =>
      accountRepository.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 10_000 },
        session
      )
    );
    accountId = account.id;

    const food = await categoryRepository.create("user-a", { name: "Food", kind: "expense" });
    foodCategoryId = food.id;
    const travel = await categoryRepository.create("user-a", { name: "Travel", kind: "expense" });
    travelCategoryId = travel.id;
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("makes five identical submissions create one ledger entry and one balance change", async () => {
    const service = transactionService(transactions);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.create(
          "user-a",
          {
            accountId: existingAccountId(accountId),
            type: "expense",
            amountMinor: 250,
            occurredAt: new Date("2026-07-12T09:00:00.000Z"),
            description: "Chai",
            tags: ["food"]
          },
          "10d11a9c-04ff-4e65-a22a-87b7f9681d98"
        )
      )
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    expect(await connectedDatabase(connection).collection("transactions").countDocuments()).toBe(1);
    expect(await connectedDatabase(connection).collection("audit_log").countDocuments()).toBe(1);

    const account = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "HDFC Savings" });
    expect(account).toMatchObject({ balanceMinor: 9_750 });
  });

  it("rolls back the transaction when the account does not belong to the user", async () => {
    const service = transactionService(transactions);
    await expect(
      service.create(
        "user-a",
        {
          accountId: "0123456789abcdef01234567",
          type: "income",
          amountMinor: 1_000,
          occurredAt: new Date("2026-07-12T09:00:00.000Z"),
          description: "Invalid account",
          tags: []
        },
        "e4e3d05c-8f9a-4662-bcaf-138d8218d862"
      )
    ).rejects.toThrow("Account not found.");

    expect(await connectedDatabase(connection).collection("transactions").countDocuments()).toBe(1);
    expect(await connectedDatabase(connection).collection("audit_log").countDocuments()).toBe(1);
  });

  it("creates exactly one compensating reversal under parallel requests", async () => {
    const service = transactionService(transactions);
    const original = await service.create(
      "user-a",
      {
        accountId: existingAccountId(accountId),
        type: "income",
        amountMinor: 1_000,
        occurredAt: new Date("2026-07-12T10:00:00.000Z"),
        description: "Salary",
        tags: []
      },
      "d7c67620-331a-4c8f-998a-e9508318b7b7"
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.reverse("user-a", original.transaction.id))
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    const originalDocument = await connectedDatabase(connection)
      .collection("transactions")
      .findOne({ idempotencyKey: "d7c67620-331a-4c8f-998a-e9508318b7b7" });
    expect(originalDocument).toMatchObject({ status: "reversed" });

    expect(await connectedDatabase(connection).collection("transactions").countDocuments()).toBe(3);
    expect(await connectedDatabase(connection).collection("audit_log").countDocuments()).toBe(3);
    const account = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "HDFC Savings" });
    expect(account).toMatchObject({ balanceMinor: 9_750 });
  });

  it("rolls back the transaction when the category does not exist", async () => {
    const service = transactionService(transactions);
    await expect(
      service.create(
        "user-a",
        {
          accountId: existingAccountId(accountId),
          categoryId: "0123456789abcdef01234567",
          type: "expense",
          amountMinor: 500,
          occurredAt: new Date("2026-07-12T09:00:00.000Z"),
          description: "Invalid category",
          tags: []
        },
        "b3a8d11c-2dfa-4933-911b-87b7f9681282"
      )
    ).rejects.toThrow("Category not found.");
  });

  it("throws EntityNotFoundError when reversing a non-existent transaction", async () => {
    const service = transactionService(transactions);
    await expect(service.reverse("user-a", "507f1f77bcf86cd799439011")).rejects.toThrow(
      EntityNotFoundError
    );
  });

  it("throws TransactionNotReversibleError when reversing a reversal transaction", async () => {
    const service = transactionService(transactions);
    const original = await service.create(
      "user-a",
      {
        accountId: existingAccountId(accountId),
        type: "income",
        amountMinor: 500,
        occurredAt: new Date("2026-07-14T09:00:00.000Z"),
        description: "Freelance",
        tags: []
      },
      "f1a2b3c4-5566-4778-899a-abbccddeeff0"
    );
    const reversed = await service.reverse("user-a", original.transaction.id);

    await expect(service.reverse("user-a", reversed.transaction.id)).rejects.toThrow(
      TransactionNotReversibleError
    );
  });

  it("updates description, tags, and category, recording a before/after audit snapshot", async () => {
    const service = transactionService(transactions);
    const created = await service.create(
      "user-a",
      {
        accountId: existingAccountId(accountId),
        categoryId: existingId(foodCategoryId),
        type: "expense",
        amountMinor: 300,
        occurredAt: new Date("2026-07-13T09:00:00.000Z"),
        description: "Vada pav",
        tags: ["snack"]
      },
      "f1a1a1a1-1111-4111-a111-111111111111"
    );

    const updated = await service.update("user-a", created.transaction.id, {
      description: "Vada pav and chai",
      tags: ["snack", "chai"],
      categoryId: existingId(travelCategoryId)
    });

    expect(updated).toMatchObject({
      description: "Vada pav and chai",
      tags: ["snack", "chai"],
      categoryId: existingId(travelCategoryId),
      amountMinor: 300,
      type: "expense"
    });

    const audit = await connectedDatabase(connection)
      .collection("audit_log")
      .findOne({ userId: "user-a", action: "transaction.update", entityId: updated.id });
    expect(audit).toMatchObject({
      meta: {
        before: {
          description: "Vada pav",
          tags: ["snack"],
          categoryId: existingId(foodCategoryId)
        },
        after: {
          description: "Vada pav and chai",
          tags: ["snack", "chai"],
          categoryId: existingId(travelCategoryId)
        }
      }
    });
  });

  it("clears the category when categoryId is explicitly null", async () => {
    const service = transactionService(transactions);
    const created = await service.create(
      "user-a",
      {
        accountId: existingAccountId(accountId),
        categoryId: existingId(foodCategoryId),
        type: "expense",
        amountMinor: 150,
        occurredAt: new Date("2026-07-13T10:00:00.000Z"),
        description: "Misc snack",
        tags: []
      },
      "f2a2a2a2-2222-4222-a222-222222222222"
    );

    const updated = await service.update("user-a", created.transaction.id, { categoryId: null });

    expect(updated.categoryId).toBeUndefined();
  });

  it("throws EntityNotFoundError when updating a transaction that does not exist", async () => {
    const service = transactionService(transactions);
    await expect(
      service.update("user-a", "507f1f77bcf86cd799439011", { description: "Ghost" })
    ).rejects.toThrow("Transaction not found.");
  });

  it("throws EntityNotFoundError when the patch references a non-existent category", async () => {
    const service = transactionService(transactions);
    const created = await service.create(
      "user-a",
      {
        accountId: existingAccountId(accountId),
        type: "expense",
        amountMinor: 200,
        occurredAt: new Date("2026-07-13T11:00:00.000Z"),
        description: "Snack",
        tags: []
      },
      "f3a3a3a3-3333-4333-a333-333333333333"
    );

    await expect(
      service.update("user-a", created.transaction.id, {
        categoryId: "0123456789abcdef01234567"
      })
    ).rejects.toThrow("Category not found.");
  });

  it("does not allow updating another user's transaction", async () => {
    const service = transactionService(transactions);
    const created = await service.create(
      "user-a",
      {
        accountId: existingAccountId(accountId),
        type: "expense",
        amountMinor: 175,
        occurredAt: new Date("2026-07-13T12:00:00.000Z"),
        description: "Private snack",
        tags: []
      },
      "f4a4a4a4-4444-4444-a444-444444444444"
    );

    await expect(
      service.update("someone-else", created.transaction.id, { description: "Hijacked" })
    ).rejects.toThrow("Transaction not found.");
  });
});

function transactionService(service: TransactionService | undefined): TransactionService {
  if (service === undefined) throw new Error("Transaction service is not ready");
  return service;
}

function existingAccountId(accountId: string | undefined): string {
  if (accountId === undefined) throw new Error("Account is not ready");
  return accountId;
}

function existingId(id: string | undefined): string {
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
