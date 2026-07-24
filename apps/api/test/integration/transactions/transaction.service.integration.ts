import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts,
  auditLog,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { TransactionMutationService } from "../../../src/transactions/transaction-mutation.service.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { CategoryKindMismatchError } from "../../../src/common/errors/category-kind-mismatch.error.js";
import { TransactionNotReversibleError } from "../../../src/common/errors/transaction-not-reversible.error.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const FAKE_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";

describe("TransactionService", () => {
  let testDb: TestDb;
  let transactions: TransactionService;
  let transactionMutations: TransactionMutationService;
  let transactionRepository: TransactionRepository;
  let accountId: string;
  let foodCategoryId: string;
  let travelCategoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");

    const accountRepository = new AccountRepository(testDb.db);
    const categoryRepository = new CategoryRepository(testDb.db);
    transactionRepository = new TransactionRepository(testDb.db);
    transactions = new TransactionService(
      testDb.db,
      accountRepository,
      categoryRepository,
      transactionRepository,
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined }
    );
    transactionMutations = new TransactionMutationService(
      transactions,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );

    const account = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 10_000 },
        tx
      )
    );
    accountId = account.id;

    const food = await categoryRepository.create("user-a", { name: "Food", kind: "expense" });
    foodCategoryId = food.id;
    const travel = await categoryRepository.create("user-a", { name: "Travel", kind: "expense" });
    travelCategoryId = travel.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("makes five identical submissions create one ledger entry and one balance change", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        transactions.create(
          "user-a",
          {
            accountId,
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
    expect((await testDb.db.select().from(transactionsTable)).length).toBe(1);
    expect((await testDb.db.select().from(auditLog)).length).toBe(1);

    const [account] = await testDb.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, "user-a"), eq(accounts.name, "HDFC Savings")));
    expect(account).toMatchObject({ balanceMinor: 9_750 });
  });

  it("rolls back the transaction when the account does not belong to the user", async () => {
    await expect(
      transactions.create(
        "user-a",
        {
          accountId: FAKE_ID,
          type: "income",
          amountMinor: 1_000,
          occurredAt: new Date("2026-07-12T09:00:00.000Z"),
          description: "Invalid account",
          tags: []
        },
        "e4e3d05c-8f9a-4662-bcaf-138d8218d862"
      )
    ).rejects.toThrow("Account not found.");

    expect((await testDb.db.select().from(transactionsTable)).length).toBe(1);
    expect((await testDb.db.select().from(auditLog)).length).toBe(1);
  });

  it("creates exactly one compensating reversal under parallel requests", async () => {
    const original = await transactions.create(
      "user-a",
      {
        accountId,
        type: "income",
        amountMinor: 1_000,
        occurredAt: new Date("2026-07-12T10:00:00.000Z"),
        description: "Salary",
        tags: []
      },
      "d7c67620-331a-4c8f-998a-e9508318b7b7"
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => transactions.reverse("user-a", original.transaction.id))
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    const [originalRow] = await testDb.db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.idempotencyKey, "d7c67620-331a-4c8f-998a-e9508318b7b7"));
    expect(originalRow).toMatchObject({ status: "reversed" });

    expect((await testDb.db.select().from(transactionsTable)).length).toBe(3);
    expect((await testDb.db.select().from(auditLog)).length).toBe(3);
    const [account] = await testDb.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, "user-a"), eq(accounts.name, "HDFC Savings")));
    expect(account).toMatchObject({ balanceMinor: 9_750 });
  });

  it("rolls back the transaction when the category does not exist", async () => {
    await expect(
      transactions.create(
        "user-a",
        {
          accountId,
          categoryId: FAKE_ID,
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

  it("rejects a category whose kind does not match the transaction type", async () => {
    await expect(
      transactions.create(
        "user-a",
        {
          accountId,
          categoryId: foodCategoryId,
          type: "income",
          amountMinor: 500,
          occurredAt: new Date("2026-07-12T09:30:00.000Z"),
          description: "Misclassified refund",
          tags: []
        },
        "d3a8d11c-2dfa-4933-911b-87b7f9681283"
      )
    ).rejects.toThrow(CategoryKindMismatchError);
  });

  it("throws EntityNotFoundError when reversing a non-existent transaction", async () => {
    await expect(transactions.reverse("user-a", FAKE_ID)).rejects.toThrow(EntityNotFoundError);
  });

  it("throws TransactionNotReversibleError when reversing a reversal transaction", async () => {
    const original = await transactions.create(
      "user-a",
      {
        accountId,
        type: "income",
        amountMinor: 500,
        occurredAt: new Date("2026-07-14T09:00:00.000Z"),
        description: "Freelance",
        tags: []
      },
      "f1a2b3c4-5566-4778-899a-abbccddeeff0"
    );
    const reversed = await transactions.reverse("user-a", original.transaction.id);

    await expect(transactions.reverse("user-a", reversed.transaction.id)).rejects.toThrow(
      TransactionNotReversibleError
    );
  });

  it("can reverse a transaction after its account is archived", async () => {
    const accountRepository = new AccountRepository(testDb.db);
    const account = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-a",
        { name: "Archived ledger", type: "bank", openingBalanceMinor: 5_000 },
        tx
      )
    );
    const original = await transactions.create(
      "user-a",
      {
        accountId: account.id,
        type: "expense",
        amountMinor: 750,
        occurredAt: new Date("2026-07-14T10:00:00.000Z"),
        description: "Final account expense",
        tags: []
      },
      "e1a2b3c4-5566-4778-899a-abbccddeeff1"
    );
    await accountRepository.archive("user-a", account.id);

    await transactions.reverse("user-a", original.transaction.id);

    const [archived] = await testDb.db.select().from(accounts).where(eq(accounts.id, account.id));
    expect(archived).toMatchObject({ isArchived: true, balanceMinor: 5_000 });
  });

  it("updates description, tags, and category, recording a before/after audit snapshot", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        categoryId: foodCategoryId,
        type: "expense",
        amountMinor: 300,
        occurredAt: new Date("2026-07-13T09:00:00.000Z"),
        description: "Vada pav",
        tags: ["snack"]
      },
      "f1a1a1a1-1111-4111-a111-111111111111"
    );

    const updated = await transactions.update("user-a", created.transaction.id, {
      description: "Vada pav and chai",
      tags: ["snack", "chai"],
      categoryId: travelCategoryId
    });

    expect(updated).toMatchObject({
      description: "Vada pav and chai",
      tags: ["snack", "chai"],
      categoryId: travelCategoryId,
      amountMinor: 300,
      type: "expense"
    });

    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, "user-a"),
          eq(auditLog.action, "transaction.update"),
          eq(auditLog.entityId, updated.id)
        )
      );
    expect(audit).toMatchObject({
      meta: {
        before: {
          description: "Vada pav",
          tags: ["snack"],
          categoryId: foodCategoryId
        },
        after: {
          description: "Vada pav and chai",
          tags: ["snack", "chai"],
          categoryId: travelCategoryId
        }
      }
    });
  });

  it("clears the category when categoryId is explicitly null", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        categoryId: foodCategoryId,
        type: "expense",
        amountMinor: 150,
        occurredAt: new Date("2026-07-13T10:00:00.000Z"),
        description: "Misc snack",
        tags: []
      },
      "f2a2a2a2-2222-4222-a222-222222222222"
    );

    const updated = await transactions.update("user-a", created.transaction.id, {
      categoryId: null
    });

    expect(updated.categoryId).toBeUndefined();
  });

  it("throws EntityNotFoundError when updating a transaction that does not exist", async () => {
    await expect(transactions.update("user-a", FAKE_ID, { description: "Ghost" })).rejects.toThrow(
      "Transaction not found."
    );
  });

  it("throws EntityNotFoundError when the patch references a non-existent category", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        type: "expense",
        amountMinor: 200,
        occurredAt: new Date("2026-07-13T11:00:00.000Z"),
        description: "Snack",
        tags: []
      },
      "f3a3a3a3-3333-4333-a333-333333333333"
    );

    await expect(
      transactions.update("user-a", created.transaction.id, { categoryId: FAKE_ID })
    ).rejects.toThrow("Category not found.");
  });

  it("rejects changing a transaction to a category of the wrong kind", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        type: "income",
        amountMinor: 200,
        occurredAt: new Date("2026-07-13T11:30:00.000Z"),
        description: "Refund",
        tags: []
      },
      "f3a3a3a3-3333-4333-a333-333333333334"
    );

    await expect(
      transactions.update("user-a", created.transaction.id, { categoryId: foodCategoryId })
    ).rejects.toThrow(CategoryKindMismatchError);
  });

  it("does not allow updating another user's transaction", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        type: "expense",
        amountMinor: 175,
        occurredAt: new Date("2026-07-13T12:00:00.000Z"),
        description: "Private snack",
        tags: []
      },
      "f4a4a4a4-4444-4444-a444-444444444444"
    );

    await expect(
      transactions.update("someone-else", created.transaction.id, { description: "Hijacked" })
    ).rejects.toThrow("Transaction not found.");
  });

  it("loads one transaction by id only for its owner", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        type: "expense",
        amountMinor: 125,
        occurredAt: new Date("2026-07-14T12:00:00.000Z"),
        description: "Detail lookup",
        tags: []
      },
      "12121212-aaaa-4121-8121-121212121212"
    );

    await expect(transactions.get("user-a", created.transaction.id)).resolves.toEqual(
      created.transaction
    );
    await expect(transactions.get("someone-else", created.transaction.id)).rejects.toThrow(
      "Transaction not found."
    );
  });

  it("updates metadata exactly once across five identical attempts", async () => {
    const created = await transactions.create(
      "user-a",
      {
        accountId,
        type: "expense",
        amountMinor: 225,
        occurredAt: new Date("2026-07-14T13:00:00.000Z"),
        description: "Original metadata",
        tags: []
      },
      "13131313-aaaa-4131-8131-131313131313"
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        transactionMutations.update(
          "user-a",
          created.transaction.id,
          { description: "Updated once", tags: ["verified"] },
          "14141414-aaaa-4141-8141-141414141414"
        )
      )
    );

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.result.updatedAt.getTime())).size).toBe(1);
    expect(
      (
        await testDb.db
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.userId, "user-a"),
              eq(auditLog.action, "transaction.update"),
              eq(auditLog.entityId, created.transaction.id)
            )
          )
      ).length
    ).toBe(1);
  });

  it("rejects metadata edits on an individual transfer leg", async () => {
    const transferLeg = await withTxn(testDb.db, (tx) =>
      transactionRepository.create(
        "user-a",
        {
          accountId,
          type: "expense",
          amountMinor: 500,
          occurredAt: new Date("2026-07-14T14:00:00.000Z"),
          description: "Transfer leg",
          tags: []
        },
        undefined,
        tx,
        "3fa85f64-5717-4562-b3fc-2c963f66af99"
      )
    );

    await expect(
      transactionMutations.update(
        "user-a",
        transferLeg.id,
        { description: "One-sided edit" },
        "15151515-aaaa-4151-8151-151515151515"
      )
    ).rejects.toThrow("Transfer leg metadata cannot be edited independently.");
  });
});
