import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AccountInsightsRepository } from "../../../src/accounts/account-insights.repository.js";
import { buildAccountInsightsWindow } from "../../../src/accounts/account-insights-window.js";
import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("AccountInsightsRepository", () => {
  let testDb: TestDb;
  let insightsRepository: AccountInsightsRepository;
  let account: Awaited<ReturnType<AccountRepository["create"]>>;

  beforeAll(async () => {
    testDb = await createTestDb();
    await Promise.all([insertTestUser(testDb.db, "user-a"), insertTestUser(testDb.db, "user-b")]);

    const accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    const transactionService = new TransactionService(
      testDb.db,
      accounts,
      categories,
      transactions,
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined, error: () => undefined }
    );
    insightsRepository = new AccountInsightsRepository(testDb.db);

    account = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "Primary bank", type: "bank", openingBalanceMinor: 100_000 },
        tx
      )
    );
    const otherAccount = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-b",
        { name: "Other tenant", type: "bank", openingBalanceMinor: 500_000 },
        tx
      )
    );
    const food = await categories.create("user-a", {
      name: "Food",
      kind: "expense",
      color: "#16A34A"
    });

    const create = async (
      input: Readonly<{
        type: "income" | "expense";
        amountMinor: number;
        occurredAt: string;
        description: string;
        categoryId?: string;
      }>,
      key: string
    ) =>
      transactionService.create(
        "user-a",
        {
          accountId: account.id,
          ...input,
          occurredAt: new Date(input.occurredAt),
          tags: []
        },
        key
      );

    await create(
      {
        type: "expense",
        amountMinor: 5_000,
        occurredAt: "2026-07-10T09:00:00.000Z",
        description: "Before selected range",
        categoryId: food.id
      },
      "10000000-0000-4000-8000-000000000001"
    );
    await create(
      {
        type: "expense",
        amountMinor: 10_000,
        occurredAt: "2026-08-01T09:00:00.000Z",
        description: "Groceries",
        categoryId: food.id
      },
      "10000000-0000-4000-8000-000000000002"
    );
    await create(
      {
        type: "income",
        amountMinor: 30_000,
        occurredAt: "2026-08-02T09:00:00.000Z",
        description: "Refund"
      },
      "10000000-0000-4000-8000-000000000003"
    );
    await create(
      {
        type: "expense",
        amountMinor: 7_000,
        occurredAt: "2026-08-03T09:00:00.000Z",
        description: "Dining",
        categoryId: food.id
      },
      "10000000-0000-4000-8000-000000000004"
    );

    await transactionService.create(
      "user-b",
      {
        accountId: otherAccount.id,
        type: "expense",
        amountMinor: 400_000,
        occurredAt: new Date("2026-08-01T09:00:00.000Z"),
        description: "Other tenant movement",
        tags: []
      },
      "20000000-0000-4000-8000-000000000001"
    );
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns tenant-scoped movement, running balance, and consumption mix", async () => {
    const window = buildAccountInsightsWindow(
      "30d",
      account.createdAt,
      new Date("2026-08-15T12:00:00.000Z")
    );
    const insights = await insightsRepository.get("user-a", account, window);

    expect(insights.summary).toEqual({
      incomeMinor: 30_000,
      expenseMinor: 17_000,
      netMinor: 13_000,
      transactionCount: 3
    });
    expect(insights.balanceSeries[0]).toEqual({
      period: "2026-07-17",
      balanceMinor: 95_000
    });
    expect(insights.balanceSeries.at(-1)?.balanceMinor).toBe(108_000);
    expect(insights.spendingByCategory).toEqual([
      {
        categoryId: expect.any(String),
        name: "Food",
        color: "#16A34A",
        amountMinor: 17_000,
        transactionCount: 2
      }
    ]);
  });

  it("does not expose the owned account's activity under another user id", async () => {
    const window = buildAccountInsightsWindow(
      "30d",
      account.createdAt,
      new Date("2026-08-15T12:00:00.000Z")
    );
    const insights = await insightsRepository.get("user-b", account, window);

    expect(insights.summary).toEqual({
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      transactionCount: 0
    });
    expect(insights.spendingByCategory).toEqual([]);
  });
});
