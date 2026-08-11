import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { ColumnMapping } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategorySuggestionRepository } from "../../../src/category-rules/category-suggestion.repository.js";
import { CategorySuggestionService } from "../../../src/category-rules/category-suggestion.service.js";
import { accounts as accountsTable, auditLog } from "../../../src/common/db/schema/index.js";
import { transactions as transactionsTable } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { CategoryKindMismatchError } from "../../../src/common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { ImportBatchNotReadyError } from "../../../src/common/errors/import-batch-not-ready.error.js";
import { MetricsService } from "../../../src/common/observability/metrics.service.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import type { NewStagedRow } from "../../../src/imports/staged-row.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

function includableRow(overrides: Partial<NewStagedRow> = {}): NewStagedRow {
  return {
    rowNumber: 1,
    raw: { "Txn Date": "04/07/2026", Narration: "Chai", Amount: "-20.00" },
    parsed: {
      occurredAt: new Date("2026-07-04T00:00:00Z"),
      amountMinor: 2_000,
      type: "expense",
      description: "Chai"
    },
    dedupeFingerprintV2: `fingerprint-${Math.random().toString(36).slice(2)}`,
    problems: [],
    isDuplicate: false,
    include: true,
    ...overrides
  };
}

describe("ImportsService commit/revert", () => {
  let testDb: TestDb;
  let service: ImportsService;
  let batches: ImportBatchRepository;
  let stagedRows: StagedRowRepository;
  let transactions: TransactionRepository;
  let accounts: AccountRepository;
  let categories: CategoryRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of [
      "user-commit-1",
      "user-commit-resume",
      "user-commit-guard",
      "user-commit-owner",
      "user-category-guard",
      "user-revert-1",
      "user-revert-resume",
      "user-revert-archived",
      "user-revert-guard",
      "user-revert-owner",
      "category-victim"
    ]) {
      await insertTestUser(testDb.db, userId);
    }

    batches = new ImportBatchRepository(testDb.db);
    stagedRows = new StagedRowRepository(testDb.db);
    transactions = new TransactionRepository(testDb.db);
    accounts = new AccountRepository(testDb.db);
    categories = new CategoryRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categoryRules = new CategoryRuleRepository(testDb.db);
    service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      categories,
      audit,
      new CategorySuggestionService(categoryRules, new CategorySuggestionRepository(testDb.db)),
      focusedTestDouble<MetricsService>({ recordCategorySuggestions: () => undefined })
    );
  }, 30_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function seedAccount(userId: string, openingBalanceMinor = 100_000): Promise<string> {
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(userId, { name: "Test Account", type: "bank", openingBalanceMinor }, tx)
    );
    return account.id;
  }

  async function seedStagedBatch(
    userId: string,
    accountId: string,
    rows: NewStagedRow[]
  ): Promise<string> {
    const batch = await batches.create(
      userId,
      accountId,
      "statement.csv",
      `sha256:${Math.random().toString(36).slice(2)}`,
      MAPPING
    );
    await stagedRows.insertMany(userId, batch.id, rows);
    await batches.markParsed(userId, batch.id, "staged", {
      total: rows.length,
      staged: rows.length,
      duplicates: 0,
      committed: 0
    });
    return batch.id;
  }

  it("commits includable rows, posts transactions, and applies the net balance delta in one pass", async () => {
    const userId = "user-commit-1";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [
      includableRow({ rowNumber: 1 }), // expense 2_000
      includableRow({
        rowNumber: 2,
        parsed: {
          occurredAt: new Date("2026-07-05T00:00:00Z"),
          amountMinor: 5_000,
          type: "income",
          description: "Refund"
        }
      }) // income 5_000
    ]);

    const committed = await service.commitBatch(userId, batchId);

    expect(committed.status).toBe("committed");
    expect(committed.committedAt).toBeInstanceOf(Date);
    expect(committed.stats.committed).toBe(2);

    const posted = await transactions.findPostedByImportBatchId(userId, batchId);
    expect(posted).toHaveLength(2);
    expect(posted.every((txn) => txn.source === "csv_import")).toBe(true);

    const [account] = await testDb.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    // net = -2_000 (expense) + 5_000 (income) = +3_000
    expect(account).toMatchObject({ balanceMinor: 103_000 });

    const auditEntries = await testDb.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.userId, userId), eq(auditLog.action, "import.commit")));
    expect(auditEntries.length).toBeGreaterThan(0);
  });

  it("is resumable: re-committing after a partial landing only processes what's left", async () => {
    const userId = "user-commit-resume";
    const accountId = await seedAccount(userId, 100_000);
    const rows = [
      includableRow({ rowNumber: 1 }),
      includableRow({ rowNumber: 2 }),
      includableRow({ rowNumber: 3 })
    ];
    const batchId = await seedStagedBatch(userId, accountId, rows);

    // Simulate a crash after chunk 1 of a resumed run: land row 1's
    // transaction directly (bypassing commitBatch) while the batch stays
    // "staged", exactly like an interrupted commit would leave things.
    const [firstRow] = await stagedRows.findIncludableForBatch(userId, batchId);
    await withTxn(testDb.db, async (tx) => {
      await transactions.insertImportedRows(
        userId,
        accountId,
        batchId,
        [
          {
            occurredAt: nonNull(firstRow).parsed?.occurredAt ?? new Date(),
            amountMinor: 2_000,
            type: "expense",
            description: "Chai",
            dedupeFingerprintV2: nonNull(nonNull(firstRow).dedupeFingerprintV2)
          }
        ],
        tx
      );
      await accounts.applyBalanceDelta(userId, accountId, -2_000, tx);
    });
    const committed = await service.commitBatch(userId, batchId);

    expect(committed.status).toBe("committed");
    const posted = await transactions.findPostedByImportBatchId(userId, batchId);
    // Exactly 3 transactions total — the pre-landed one was not duplicated.
    expect(posted).toHaveLength(rows.length);
    const dedupeFingerprints = new Set(rows.map((row) => row.dedupeFingerprintV2));
    expect(new Set(posted.map((txn) => txn.description))).toEqual(new Set(["Chai"]));
    expect(dedupeFingerprints.size).toBe(3);
  });

  it("rejects committing a batch that is not staged", async () => {
    const userId = "user-commit-guard";
    const accountId = await seedAccount(userId);
    const batch = await batches.create(
      userId,
      accountId,
      "pending.csv",
      `sha256:${Math.random().toString(36).slice(2)}`,
      MAPPING
    );

    await expect(service.commitBatch(userId, batch.id)).rejects.toThrow(ImportBatchNotReadyError);
  });

  it("404s committing another user's batch", async () => {
    const ownerId = "user-commit-owner";
    const accountId = await seedAccount(ownerId);
    const batchId = await seedStagedBatch(ownerId, accountId, [includableRow()]);

    await expect(service.commitBatch("someone-else", batchId)).rejects.toThrow(EntityNotFoundError);
  });

  it("rejects assigning a cross-tenant or wrong-kind category to a staged row", async () => {
    const userId = "user-category-guard";
    const accountId = await seedAccount(userId);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);
    const [row] = await stagedRows.findIncludableForBatch(userId, batchId);
    const foreignCategory = await categories.create("category-victim", {
      name: "Private category",
      kind: "expense"
    });

    await expect(
      service.updateRow(userId, batchId, nonNull(row).id, {
        suggestedCategoryId: foreignCategory.id
      })
    ).rejects.toThrow(EntityNotFoundError);

    const wrongKindCategory = await categories.create(userId, {
      name: "Income only",
      kind: "income"
    });
    await expect(
      service.updateRow(userId, batchId, nonNull(row).id, {
        suggestedCategoryId: wrongKindCategory.id
      })
    ).rejects.toThrow(CategoryKindMismatchError);
  });

  it("reverts a committed batch: reverses every posted transaction and restores the balance", async () => {
    const userId = "user-revert-1";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [
      includableRow({ rowNumber: 1 }), // expense 2_000
      includableRow({
        rowNumber: 2,
        parsed: {
          occurredAt: new Date("2026-07-05T00:00:00Z"),
          amountMinor: 5_000,
          type: "income",
          description: "Refund"
        }
      })
    ]);
    await service.commitBatch(userId, batchId);

    const [balanceAfterCommit] = await testDb.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    expect(balanceAfterCommit).toMatchObject({ balanceMinor: 103_000 });

    const reverted = await service.revertBatch(userId, batchId);

    expect(reverted.status).toBe("reverted");
    expect(reverted.revertedAt).toBeInstanceOf(Date);

    const [balanceAfterRevert] = await testDb.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    expect(balanceAfterRevert).toMatchObject({ balanceMinor: 100_000 });

    const stillPosted = await transactions.findPostedByImportBatchId(userId, batchId);
    expect(stillPosted).toHaveLength(0);

    const auditEntries = await testDb.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.userId, userId), eq(auditLog.action, "import.revert")));
    expect(auditEntries.length).toBeGreaterThan(0);
  });

  it("is resumable: re-reverting after a partial reversal only reverses what's left", async () => {
    const userId = "user-revert-resume";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [
      includableRow({ rowNumber: 1 }),
      includableRow({ rowNumber: 2 })
    ]);
    await service.commitBatch(userId, batchId);

    // Simulate a crash mid-revert: reverse only the first posted txn
    // directly, leaving the batch status at "committed" (as a real
    // mid-revert crash would).
    const posted = await transactions.findPostedByImportBatchId(userId, batchId);
    const [firstPosted] = posted;
    await withTxn(testDb.db, async (tx) => {
      await transactions.insertBulkReversals(userId, [nonNull(firstPosted)], tx);
      await accounts.applyReversalBalanceDelta(userId, accountId, 2_000, tx);
    });

    const reverted = await service.revertBatch(userId, batchId);

    expect(reverted.status).toBe("reverted");
    const stillPosted = await transactions.findPostedByImportBatchId(userId, batchId);
    expect(stillPosted).toHaveLength(0);

    // Exactly one reversal per original — not two for the pre-reversed one.
    const reversals = await testDb.db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          inArray(
            transactionsTable.reversalOf,
            posted.map((txn) => txn.id)
          )
        )
      );
    expect(reversals).toHaveLength(2);
  });

  it("can revert an import after its account is archived", async () => {
    const userId = "user-revert-archived";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);
    await service.commitBatch(userId, batchId);
    await accounts.archive(userId, accountId);

    const reverted = await service.revertBatch(userId, batchId);

    expect(reverted.status).toBe("reverted");
    const [account] = await testDb.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    expect(account).toMatchObject({ isArchived: true, balanceMinor: 100_000 });
  });

  it("rejects reverting a batch that is not committed", async () => {
    const userId = "user-revert-guard";
    const accountId = await seedAccount(userId);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);

    await expect(service.revertBatch(userId, batchId)).rejects.toThrow(ImportBatchNotReadyError);
  });

  it("404s reverting another user's batch", async () => {
    const ownerId = "user-revert-owner";
    const accountId = await seedAccount(ownerId);
    const batchId = await seedStagedBatch(ownerId, accountId, [includableRow()]);
    await service.commitBatch(ownerId, batchId);

    await expect(service.revertBatch("someone-else", batchId)).rejects.toThrow(EntityNotFoundError);
  });
});

function nonNull<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Test fixture is not ready");
  }
  return value;
}
