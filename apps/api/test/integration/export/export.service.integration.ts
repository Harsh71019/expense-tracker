import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { ExportService } from "../../../src/export/export.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("ExportService", () => {
  let testDb: TestDb;
  let exportService: ExportService;
  let accountId: string;
  let categoryId: string;
  let transactionsService: TransactionService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-export");
    await insertTestUser(testDb.db, "user-range");

    const accountRepository = new AccountRepository(testDb.db);
    const categoryRepository = new CategoryRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    transactionsService = new TransactionService(
      testDb.db,
      accountRepository,
      categoryRepository,
      transactionRepository,
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined }
    );
    exportService = new ExportService(transactionRepository, accountRepository, categoryRepository);

    const account = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-export",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 10_000 },
        tx
      )
    );
    accountId = account.id;
    const category = await categoryRepository.create("user-export", {
      name: "Food, Snacks",
      kind: "expense"
    });
    categoryId = category.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("exports posted transactions as CSV, excludes reversed pairs, neutralizes formula-injection cells", async () => {
    await transactionsService.create(
      "user-export",
      {
        accountId,
        categoryId,
        type: "expense",
        amountMinor: 2_000,
        occurredAt: new Date("2026-07-04T09:00:00.000Z"),
        description: "=cmd|'/c calc'!A1",
        tags: ["snacks"]
      },
      "aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa"
    );
    const toReverse = await transactionsService.create(
      "user-export",
      {
        accountId,
        type: "income",
        amountMinor: 5_000,
        occurredAt: new Date("2026-07-05T09:00:00.000Z"),
        description: "Refund",
        tags: []
      },
      "bbbbbbbb-2222-4222-a222-bbbbbbbbbbbb"
    );
    await transactionsService.reverse("user-export", toReverse.transaction.id);

    const csv = await exportService.generateCsv("user-export", {});
    const lines = csv.trim().split("\r\n");

    expect(lines[0]).toBe("Date,Type,Status,Account,Category,Description,Tags,Amount (INR)");
    // Only the still-posted expense — the reversed income and its reversal
    // (status: "reversal") are excluded from a plain "current state" export.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("HDFC Savings");
    expect(lines[1]).toContain('"Food, Snacks"');
    // The malicious description is neutralized with a leading ' — no comma/quote/newline
    // in it, so it isn't CSV-quoted, just formula-neutralized.
    expect(lines[1]).toContain("'=cmd|'/c calc'!A1");
    // The amount is programmatically formatted, never attacker-controlled, so it's
    // not neutralized despite legitimately starting with "-".
    expect(lines[1]).toContain(",-₹20.00");
    expect(lines[1]).not.toContain("'-₹20.00");
  });

  it("filters by date range", async () => {
    await transactionsService.create(
      "user-range",
      {
        accountId: (
          await withTxn(testDb.db, (tx) =>
            new AccountRepository(testDb.db).create(
              "user-range",
              { name: "Cash", type: "cash", openingBalanceMinor: 0 },
              tx
            )
          )
        ).id,
        type: "expense",
        amountMinor: 1_000,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        description: "January",
        tags: []
      },
      "cccccccc-3333-4333-a333-cccccccccccc"
    );

    const csv = await exportService.generateCsv("user-range", {
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-03-01T00:00:00.000Z")
    });
    expect(csv.trim().split("\r\n")).toHaveLength(1); // header only
  });
});
