import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnMapping } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategorySuggestionRepository } from "../../../src/category-rules/category-suggestion.repository.js";
import { CategorySuggestionService } from "../../../src/category-rules/category-suggestion.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
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

describe("ImportsService.deleteBatch", () => {
  let testDb: TestDb;
  let service: ImportsService;
  let batches: ImportBatchRepository;
  let stagedRows: StagedRowRepository;
  let accounts: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of [
      "user-delete-pending",
      "user-delete-staged",
      "user-delete-reverted",
      "user-delete-committed",
      "user-delete-in-progress",
      "user-delete-owner"
    ]) {
      await insertTestUser(testDb.db, userId);
    }

    batches = new ImportBatchRepository(testDb.db);
    stagedRows = new StagedRowRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
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

  it("deletes a pending batch that hasn't parsed yet", async () => {
    const userId = "user-delete-pending";
    const accountId = await seedAccount(userId);
    const batch = await batches.create(
      userId,
      accountId,
      "pending.csv",
      `sha256:${Math.random().toString(36).slice(2)}`,
      MAPPING
    );

    await service.deleteBatch(userId, batch.id);

    expect(await batches.findById(userId, batch.id)).toBeNull();
  });

  it("deletes a staged batch and removes its staged rows", async () => {
    const userId = "user-delete-staged";
    const accountId = await seedAccount(userId);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);

    await service.deleteBatch(userId, batchId);

    expect(await batches.findById(userId, batchId)).toBeNull();
    const page = await stagedRows.findByBatchId(userId, batchId, undefined, 50);
    expect(page.items).toHaveLength(0);
  });

  it("rejects deleting a reverted batch — its (reversed) originals and their reversals still reference it", async () => {
    const userId = "user-delete-reverted";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);
    await service.commitBatch(userId, batchId);
    await service.revertBatch(userId, batchId);

    await expect(service.deleteBatch(userId, batchId)).rejects.toThrow(ImportBatchNotReadyError);
    expect(await batches.findById(userId, batchId)).not.toBeNull();
  });

  it("rejects deleting a staged batch that already has a partially-landed transaction from an interrupted commit", async () => {
    const userId = "user-delete-staged-partial";
    await insertTestUser(testDb.db, userId);
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);
    const [row] = await stagedRows.findIncludableForBatch(userId, batchId);
    if (row === undefined) throw new Error("Test fixture is not ready");
    const transactions = new TransactionRepository(testDb.db);

    // Simulate a crash mid-commit: land the row's transaction directly
    // (bypassing commitBatch) while the batch stays "staged" — exactly as a
    // real interrupted commit would leave it.
    await withTxn(testDb.db, async (tx) => {
      await transactions.insertImportedRows(
        userId,
        accountId,
        batchId,
        [
          {
            occurredAt: row.parsed?.occurredAt ?? new Date(),
            amountMinor: 2_000,
            type: "expense",
            description: "Chai",
            dedupeFingerprintV2: row.dedupeFingerprintV2 ?? "fingerprint"
          }
        ],
        tx
      );
      await accounts.applyBalanceDelta(userId, accountId, -2_000, tx);
    });

    await expect(service.deleteBatch(userId, batchId)).rejects.toThrow(ImportBatchNotReadyError);
    expect(await batches.findById(userId, batchId)).not.toBeNull();
  });

  it("rejects deleting a committed batch — the ledger is append-only", async () => {
    const userId = "user-delete-committed";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);
    await service.commitBatch(userId, batchId);

    await expect(service.deleteBatch(userId, batchId)).rejects.toThrow(ImportBatchNotReadyError);
    expect(await batches.findById(userId, batchId)).not.toBeNull();
  });

  it("rejects deleting a batch with an in-flight workflow", async () => {
    const userId = "user-delete-in-progress";
    const accountId = await seedAccount(userId);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);
    const queued = await batches.queueWorkflow(userId, batchId, "commit", "corr-1");
    expect(queued).toBe(true);

    await expect(service.deleteBatch(userId, batchId)).rejects.toThrow(ImportBatchNotReadyError);
    expect(await batches.findById(userId, batchId)).not.toBeNull();
  });

  it("404s deleting another user's batch", async () => {
    const ownerId = "user-delete-owner";
    const accountId = await seedAccount(ownerId);
    const batchId = await seedStagedBatch(ownerId, accountId, [includableRow()]);

    await expect(service.deleteBatch("someone-else", batchId)).rejects.toThrow(EntityNotFoundError);
    expect(await batches.findById(ownerId, batchId)).not.toBeNull();
  });

  it("404s deleting a batch that's already gone", async () => {
    await expect(
      service.deleteBatch("user-delete-pending", "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(EntityNotFoundError);
  });
});
