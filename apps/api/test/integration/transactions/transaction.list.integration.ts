import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("TransactionService.list", () => {
  let testDb: TestDb;
  let transactions: TransactionService;
  let cashAccountId: string;
  let foodCategoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "other-user");

    const accountRepository = new AccountRepository(testDb.db);
    const categoryRepository = new CategoryRepository(testDb.db);
    transactions = new TransactionService(
      testDb.db,
      accountRepository,
      categoryRepository,
      new TransactionRepository(testDb.db),
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined }
    );

    const hdfc = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        tx
      )
    );

    const cash = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-a",
        { name: "Cash", type: "cash", openingBalanceMinor: 5_000 },
        tx
      )
    );
    cashAccountId = cash.id;

    const food = await categoryRepository.create("user-a", { name: "Food", kind: "expense" });
    foodCategoryId = food.id;

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
      await transactions.create(
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
    await testDb.teardown();
  });

  it("returns pages newest-first and paginates via cursor without gaps or duplicates", async () => {
    const firstPage = await transactions.list("user-a", { limit: 2 });
    expect(firstPage.items.map((t) => t.description)).toEqual(["Chai again", "Groceries"]);
    expect(firstPage.pageInfo).toMatchObject({ hasMore: true, limit: 2 });

    const secondPage = await transactions.list("user-a", {
      limit: 2,
      cursor: existingCursor(firstPage.pageInfo.nextCursor)
    });
    expect(secondPage.items.map((t) => t.description)).toEqual(["Vada pav", "Metro card"]);
    expect(secondPage.pageInfo).toMatchObject({ hasMore: true, limit: 2 });

    const thirdPage = await transactions.list("user-a", {
      limit: 2,
      cursor: existingCursor(secondPage.pageInfo.nextCursor)
    });
    expect(thirdPage.items.map((t) => t.description)).toEqual(["Chai"]);
    expect(thirdPage.pageInfo).toEqual({ nextCursor: null, hasMore: false, limit: 2 });
  });

  it("filters by accountId", async () => {
    const page = await transactions.list("user-a", { accountId: cashAccountId, limit: 50 });
    expect(page.items.map((t) => t.description)).toEqual(["Vada pav"]);
  });

  it("filters by categoryId", async () => {
    const page = await transactions.list("user-a", { categoryId: foodCategoryId, limit: 50 });
    expect(page.items.map((t) => t.description)).toEqual(["Vada pav", "Chai"]);
  });

  it("filters by case-insensitive description search", async () => {
    const page = await transactions.list("user-a", { q: "chai", limit: 50 });
    expect(page.items.map((t) => t.description)).toEqual(["Chai again", "Chai"]);
  });

  it("filters by occurredAt range", async () => {
    const page = await transactions.list("user-a", {
      from: new Date("2026-07-02T00:00:00.000Z"),
      to: new Date("2026-07-03T23:59:59.000Z"),
      limit: 50
    });
    expect(page.items.map((t) => t.description)).toEqual(["Vada pav", "Metro card"]);
  });

  it("rejects a malformed cursor", async () => {
    await expect(
      transactions.list("user-a", { cursor: "not-a-real-cursor", limit: 10 })
    ).rejects.toThrow("Invalid cursor.");
  });

  it("scopes results to the requesting user", async () => {
    const page = await transactions.list("other-user", { limit: 50 });
    expect(page.items).toEqual([]);
  });
});

function existingCursor(cursor: string | null): string {
  if (cursor === null) throw new Error("Expected a next-page cursor");
  return cursor;
}
