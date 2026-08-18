import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { EssentialBurnRepository } from "../../../src/financial-safety/essential-burn.repository.js";
import { EssentialBurnService } from "../../../src/financial-safety/essential-burn.service.js";
import { LedgerHistoryDiagnosticReadService } from "../../../src/transactions/ledger-history-diagnostic-read.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("EssentialBurn Integration Suite", () => {
  let testDb: TestDb;
  let essentialBurnService: EssentialBurnService;
  let transactionService: TransactionService;
  let categoryRepo: CategoryRepository;
  let accountRepo: AccountRepository;
  let ledgerDiagnostic: LedgerHistoryDiagnosticReadService;

  const dummyLogger = {
    log: () => {},
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {}
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    const db = testDb.db;

    await insertTestUser(db, "user-burn-a");
    await insertTestUser(db, "user-burn-b");
    await insertTestUser(db, "user-burn-empty");

    const audit = new AuditRepository(db);
    accountRepo = new AccountRepository(db);
    categoryRepo = new CategoryRepository(db);
    const txnRepo = new TransactionRepository(db);

    transactionService = new TransactionService(
      db,
      accountRepo,
      categoryRepo,
      txnRepo,
      audit,
      dummyLogger
    );

    const essentialBurnRepo = new EssentialBurnRepository(db);
    essentialBurnService = new EssentialBurnService(dummyLogger, essentialBurnRepo);
    ledgerDiagnostic = new LedgerHistoryDiagnosticReadService(db);
  }, 60_000);

  afterAll(async () => {
    await assertLedgerInvariants(testDb.db);
    await testDb.teardown();
  });

  it("returns unavailable for an empty account with no transaction history", async () => {
    const asOf = new Date("2026-08-18T10:00:00.000Z");
    const result = await essentialBurnService.getEssentialBurn("user-burn-empty", asOf);

    expect(result.quality).toBe("unavailable");
    expect(result.averageMonthlyEssentialMinor).toBeNull();
    expect(result.observedCompleteMonthCount).toBe(0);
    expect(result.completeMonths).toHaveLength(3);
    expect(result.limitations).toContain("no_history");
  });

  it("calculates baseline accurately across IST month boundaries, archived categories, and filters", async () => {
    const asOf = new Date("2026-08-18T10:00:00.000Z");
    // Candidate complete months: 2026-05, 2026-06, 2026-07. Current partial month: 2026-08.

    // 1. Create accounts for User A and User B
    const accountA = await withTxn(testDb.db, (tx) =>
      accountRepo.create(
        "user-burn-a",
        { name: "User A Checking", type: "bank", openingBalanceMinor: 10_000_000 },
        tx
      )
    );
    const accountB = await withTxn(testDb.db, (tx) =>
      accountRepo.create(
        "user-burn-b",
        { name: "User B Checking", type: "bank", openingBalanceMinor: 10_000_000 },
        tx
      )
    );

    // 2. Create categories for User A
    const essentialGroceries = await categoryRepo.create("user-burn-a", {
      name: "Groceries",
      kind: "expense",
      group: "essential"
    });
    const essentialRent = await categoryRepo.create("user-burn-a", {
      name: "Rent (Old)",
      kind: "expense",
      group: "essential"
    });

    const lifestyleDining = await categoryRepo.create("user-burn-a", {
      name: "Dining Out",
      kind: "expense",
      group: "lifestyle"
    });
    const ungroupedMisc = await categoryRepo.create("user-burn-a", {
      name: "Misc Outflow",
      kind: "expense"
    });

    // 3. User B category (for tenancy isolation check)
    const userBEssential = await categoryRepo.create("user-burn-b", {
      name: "User B Groceries",
      kind: "expense",
      group: "essential"
    });

    // 4. Populate transactions for User A:

    // --- Month 2026-05 ---
    // Essential Groceries: ₹20,000 (2_000_000 paise)
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: essentialGroceries.id,
        type: "expense",
        amountMinor: 2_000_000,
        occurredAt: new Date("2026-05-10T10:00:00.000Z"),
        description: "May Groceries",
        tags: []
      },
      "10000000-0000-4000-8000-000000000001"
    );
    // Lifestyle Dining: ₹5,000 (500_000 paise)
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: lifestyleDining.id,
        type: "expense",
        amountMinor: 500_000,
        occurredAt: new Date("2026-05-20T10:00:00.000Z"),
        description: "May Dining",
        tags: []
      },
      "10000000-0000-4000-8000-000000000002"
    );

    // --- Month 2026-06 ---
    // Essential Rent: ₹30,000 (3_000_000 paise) - will be archived after creation
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: essentialRent.id,
        type: "expense",
        amountMinor: 3_000_000,
        occurredAt: new Date("2026-06-05T10:00:00.000Z"),
        description: "June Rent (Category subsequently archived)",
        tags: []
      },
      "10000000-0000-4000-8000-000000000003"
    );
    // Archive Rent category now — historical transactions must still count in essential burn!
    await categoryRepo.archive("user-burn-a", essentialRent.id);
    // Ungrouped expense: ₹2,000 (200_000 paise)
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: ungroupedMisc.id,
        type: "expense",
        amountMinor: 200_000,
        occurredAt: new Date("2026-06-15T10:00:00.000Z"),
        description: "June Misc Ungrouped",
        tags: []
      },
      "10000000-0000-4000-8000-000000000004"
    );

    // --- Month 2026-07 ---
    // Boundary test: 2026-07-31T18:29:59.000Z is 23:59:59 IST on July 31 (belongs to 2026-07)
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: essentialGroceries.id,
        type: "expense",
        amountMinor: 4_000_000,
        occurredAt: new Date("2026-07-31T18:29:59.000Z"),
        description: "Late July Groceries",
        tags: []
      },
      "10000000-0000-4000-8000-000000000005"
    );
    // Uncategorized expense: ₹1,000 (100_000 paise)
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        type: "expense",
        amountMinor: 100_000,
        occurredAt: new Date("2026-07-15T10:00:00.000Z"),
        description: "July Uncategorized Spend",
        tags: []
      },
      "10000000-0000-4000-8000-000000000006"
    );

    // --- Boundary test: 2026-07-31T18:30:00.000Z is 00:00:00 IST on August 1 (belongs to 2026-08 current partial month) ---
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: essentialGroceries.id,
        type: "expense",
        amountMinor: 1_500_000,
        occurredAt: new Date("2026-07-31T18:30:00.000Z"),
        description: "August 1 IST Groceries (Partial Month)",
        tags: []
      },
      "10000000-0000-4000-8000-000000000007"
    );

    // --- Ineligible transactions in User A ---
    // Income: ₹50,000
    await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        type: "income",
        amountMinor: 5_000_000,
        occurredAt: new Date("2026-06-01T10:00:00.000Z"),
        description: "Salary Credit",
        tags: []
      },
      "10000000-0000-4000-8000-000000000008"
    );
    // Reversed expense: ₹10,000
    const toReverse = await transactionService.create(
      "user-burn-a",
      {
        accountId: accountA.id,
        categoryId: essentialGroceries.id,
        type: "expense",
        amountMinor: 1_000_000,
        occurredAt: new Date("2026-05-15T10:00:00.000Z"),
        description: "Mistake Groceries",
        tags: []
      },
      "10000000-0000-4000-8000-000000000009"
    );
    await transactionService.reverse("user-burn-a", toReverse.transaction.id);

    // --- User B transactions (Tenant isolation) ---
    await transactionService.create(
      "user-burn-b",
      {
        accountId: accountB.id,
        categoryId: userBEssential.id,
        type: "expense",
        amountMinor: 99_000_000,
        occurredAt: new Date("2026-06-15T10:00:00.000Z"),
        description: "User B Huge Spend",
        tags: []
      },
      "20000000-0000-4000-8000-000000000001"
    );

    // 5. Execute Essential Burn for User A
    const resultA = await essentialBurnService.getEssentialBurn("user-burn-a", asOf);

    expect(resultA.quality).toBe("complete");
    expect(resultA.observedCompleteMonthCount).toBe(3);

    // May Essential: 2,000,000 paise (Groceries)
    // June Essential: 3,000,000 paise (Archived Rent)
    // July Essential: 4,000,000 paise (Groceries at 18:29:59 UTC boundary)
    // Total = 9,000,000 paise / 3 = 3,000,000 paise (₹30,000)
    expect(resultA.averageMonthlyEssentialMinor).toBe(3_000_000);

    expect(resultA.completeMonths).toEqual([
      {
        month: "2026-05",
        observation: "observed",
        essentialTotalMinor: 2_000_000,
        eligibleExpenseTransactionCount: 2, // Groceries + Dining (Reversed was excluded)
        essentialTransactionCount: 1
      },
      {
        month: "2026-06",
        observation: "observed",
        essentialTotalMinor: 3_000_000,
        eligibleExpenseTransactionCount: 2, // Rent + Misc (Income excluded)
        essentialTransactionCount: 1
      },
      {
        month: "2026-07",
        observation: "observed",
        essentialTotalMinor: 4_000_000,
        eligibleExpenseTransactionCount: 2, // Groceries + Uncategorized
        essentialTransactionCount: 1
      }
    ]);

    // Current partial month (August) has the 18:30:00 UTC transaction: 1_500_000 paise
    expect(resultA.currentPartialMonth).toEqual({
      month: "2026-08",
      essentialTotalMinor: 1_500_000,
      eligibleExpenseTransactionCount: 1,
      essentialTransactionCount: 1,
      excludedFromBaseline: true
    });

    // Classification coverage evidence
    expect(resultA.classification.uncategorizedExpenseCount).toBe(1);
    expect(resultA.classification.uncategorizedExpenseMinor).toBe(100_000);
    expect(resultA.classification.ungroupedExpenseCount).toBe(1);
    expect(resultA.classification.ungroupedExpenseMinor).toBe(200_000);
    expect(resultA.limitations).toContain("uncategorized_expenses_present");
    expect(resultA.limitations).toContain("ungrouped_categories_present");
    expect(resultA.limitations).toContain("current_category_metadata_in_use");

    // 6. Contract parity with LedgerHistoryDiagnosticReadService
    const diagnosticFacts = await ledgerDiagnostic.getLedgerHistoryDiagnosticFacts(
      "user-burn-a",
      asOf
    );
    expect(diagnosticFacts.completeMonthCount).toBe(3);
    expect(diagnosticFacts.months).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(diagnosticFacts.hasCurrentMonthExpenses).toBe(true);
    // Qualifying essential transactions: 1 in May, 1 in June, 1 in July, 1 in August = 4
    expect(diagnosticFacts.qualifyingTransactionCount).toBe(4);

    // 7. Verify User B baseline is isolated
    const resultB = await essentialBurnService.getEssentialBurn("user-burn-b", asOf);
    expect(resultB.quality).toBe("limited");
    expect(resultB.observedCompleteMonthCount).toBe(1); // June only
    expect(resultB.averageMonthlyEssentialMinor).toBe(99_000_000);
  });
});
