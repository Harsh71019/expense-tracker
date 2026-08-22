import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping, StagedRow } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategorySuggestionRepository } from "../../../src/category-rules/category-suggestion.repository.js";
import { CategorySuggestionService } from "../../../src/category-rules/category-suggestion.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryService } from "../../../src/categories/category.service.js";
import {
  accounts as accountsTable,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { ImportBatchNotReadyError } from "../../../src/common/errors/import-batch-not-ready.error.js";
import { MetricsService } from "../../../src/common/observability/metrics.service.js";
import { computeDedupeHash } from "../../../src/imports/dedupe-hash.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import type { NewStagedRow } from "../../../src/imports/staged-row.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
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

describe("Imports dedupe v2 (exact fingerprinting + near-duplicate evidence)", () => {
  let testDb: TestDb;
  let batches: ImportBatchRepository;
  let stagedRows: StagedRowRepository;
  let transactions: TransactionRepository;
  let accounts: AccountRepository;
  let categories: CategoryRepository;
  let service: ImportsService;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of [
      "user-type-sep",
      "user-v1-compat",
      "user-near-dup-a",
      "user-near-dup-b",
      "user-ambiguous",
      "user-concurrency"
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
      new CategorySuggestionService(
        categoryRules,
        new CategorySuggestionRepository(testDb.db),
        new CategoryService(categories)
      ),
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

  async function seedLegacyV1Transaction(
    userId: string,
    accountId: string,
    type: "expense" | "income",
    occurredAt: Date,
    amountMinor: number,
    description: string
  ): Promise<void> {
    const dedupeHash = computeDedupeHash(userId, accountId, occurredAt, amountMinor, description);
    const now = new Date();
    await withTxn(testDb.db, async (tx) => {
      await tx.insert(transactionsTable).values({
        userId,
        accountId,
        type,
        amountMinor,
        currency: "INR",
        occurredAt,
        description,
        tags: [],
        source: "manual",
        status: "posted",
        dedupeHash,
        createdAt: now,
        updatedAt: now
      });
      await accounts.applyBalanceDelta(
        userId,
        accountId,
        type === "income" ? amountMinor : -amountMinor,
        tx
      );
    });
  }

  async function seedPostedTransaction(
    userId: string,
    accountId: string,
    type: "expense" | "income",
    occurredAt: Date,
    amountMinor: number,
    description: string
  ): Promise<void> {
    const now = new Date();
    await withTxn(testDb.db, async (tx) => {
      await tx.insert(transactionsTable).values({
        userId,
        accountId,
        type,
        amountMinor,
        currency: "INR",
        occurredAt,
        description,
        tags: [],
        source: "manual",
        status: "posted",
        createdAt: now,
        updatedAt: now
      });
      await accounts.applyBalanceDelta(
        userId,
        accountId,
        type === "income" ? amountMinor : -amountMinor,
        tx
      );
    });
  }

  async function firstStagedRow(userId: string, batchId: string): Promise<StagedRow> {
    const page = await stagedRows.findByBatchId(userId, batchId, undefined, 10);
    const row = page.items[0];
    if (row === undefined) throw new Error("Expected at least one staged row");
    return row;
  }

  it("keeps a same-day, same-amount, same-narration expense and income separate (type-aware v2)", async () => {
    const userId = "user-type-sep";
    const accountId = await seedAccount(userId);

    // Post an expense first, through the normal import pipeline.
    const expenseBatch = await batches.create(
      userId,
      accountId,
      "expense.csv",
      "sha256:type-sep-expense",
      MAPPING
    );
    await service.parseFile(
      expenseBatch.id,
      userId,
      accountId,
      MAPPING,
      ["Txn Date,Narration,Amount", "04/07/2026,Chai,-20.00"].join("\n")
    );
    await service.commitBatch(userId, expenseBatch.id);

    // Same day, same amount, same narration, opposite type (income) — v1
    // (type-blind) would have collided here; v2 must not.
    const incomeBatch = await batches.create(
      userId,
      accountId,
      "income.csv",
      "sha256:type-sep-income",
      MAPPING
    );
    await service.parseFile(
      incomeBatch.id,
      userId,
      accountId,
      MAPPING,
      ["Txn Date,Narration,Amount", "04/07/2026,Chai,20.00"].join("\n")
    );
    const incomeRow = await firstStagedRow(userId, incomeBatch.id);
    expect(incomeRow.isDuplicate).toBe(false);
    expect(incomeRow.include).toBe(true);

    const committed = await service.commitBatch(userId, incomeBatch.id);
    expect(committed.stats.committed).toBe(1);

    const posted = await transactions.findMany(userId, { accountId, limit: 10 });
    expect(posted.items).toHaveLength(2);
    await assertLedgerInvariants(testDb.db);
  });

  it("stays compatible with a pre-migration v1-only row of the same type", async () => {
    const userId = "user-v1-compat";
    const accountId = await seedAccount(userId);
    const occurredAt = new Date("2026-07-04T00:00:00Z");

    // Simulate a transaction posted before this migration: only the legacy
    // v1 hash is populated, dedupeFingerprintV2 stays null.
    await seedLegacyV1Transaction(userId, accountId, "expense", occurredAt, 2_000, "Chai");

    const batch = await batches.create(
      userId,
      accountId,
      "legacy.csv",
      "sha256:v1-compat",
      MAPPING
    );
    await service.parseFile(
      batch.id,
      userId,
      accountId,
      MAPPING,
      ["Txn Date,Narration,Amount", "04/07/2026,Chai,-20.00"].join("\n")
    );
    const row = await firstStagedRow(userId, batch.id);
    expect(row.isDuplicate).toBe(true);
    expect(row.include).toBe(false);

    const committed = await service.commitBatch(userId, batch.id);
    expect(committed.stats.committed).toBe(0);
    const posted = await transactions.findMany(userId, { accountId, limit: 10 });
    // Only the one pre-seeded legacy row — the import correctly declined to
    // double-post against it.
    expect(posted.items).toHaveLength(1);
    await assertLedgerInvariants(testDb.db);
  });

  it("attaches near-duplicate review evidence for a close-but-not-exact narration, without excluding the row", async () => {
    const userId = "user-near-dup-a";
    const otherUserId = "user-near-dup-b";
    const accountId = await seedAccount(userId);
    const otherAccountId = await seedAccount(otherUserId);
    const occurredAt = new Date("2026-07-04T09:00:00Z");

    await seedPostedTransaction(
      userId,
      accountId,
      "expense",
      occurredAt,
      2_000,
      "Chai Point Koramangala"
    );
    // Same narration/amount/type/day for a different tenant — must never
    // leak into this user's near-duplicate evidence (tenant isolation).
    await seedPostedTransaction(
      otherUserId,
      otherAccountId,
      "expense",
      occurredAt,
      2_000,
      "Chai Point Koramangala"
    );

    const batch = await batches.create(userId, accountId, "near.csv", "sha256:near-dup", MAPPING);
    await service.parseFile(
      batch.id,
      userId,
      accountId,
      MAPPING,
      ["Txn Date,Narration,Amount", "05/07/2026,Chai Point Koramangala Store,-20.00"].join("\n")
    );
    const row = await firstStagedRow(userId, batch.id);

    // Advisory only: never auto-excluded from the ledger.
    expect(row.isDuplicate).toBe(false);
    expect(row.include).toBe(true);
    expect(row.nearDuplicateResult?.outcome).toBe("match");
    if (row.nearDuplicateResult?.outcome === "match") {
      expect(row.nearDuplicateResult.evidence.method).toBe("token_jaccard");
      expect(row.nearDuplicateResult.evidence.calendarDayDistance).toBe(1);
    }

    // Never mutates/rejects the ledger — committing still posts the row.
    const committed = await service.commitBatch(userId, batch.id);
    expect(committed.stats.committed).toBe(1);
    await assertLedgerInvariants(testDb.db);
  });

  it("returns ambiguous near-duplicate evidence when two candidates are equally close", async () => {
    const userId = "user-ambiguous";
    const accountId = await seedAccount(userId);

    // Neither seed shares the target's exact IST day, so neither collides on
    // the exact v2 fingerprint — both instead reach near-duplicate scoring
    // with an identical 2-of-4-token Jaccard score against the target.
    await seedPostedTransaction(
      userId,
      accountId,
      "expense",
      new Date("2026-07-03T09:00:00Z"),
      2_000,
      "Chai Point Malleswaram"
    );
    await seedPostedTransaction(
      userId,
      accountId,
      "expense",
      new Date("2026-07-05T09:00:00Z"),
      2_000,
      "Chai Point Indiranagar"
    );

    const batch = await batches.create(
      userId,
      accountId,
      "ambiguous.csv",
      "sha256:ambiguous",
      MAPPING
    );
    await service.parseFile(
      batch.id,
      userId,
      accountId,
      MAPPING,
      ["Txn Date,Narration,Amount", "04/07/2026,Chai Point Koramangala,-20.00"].join("\n")
    );
    const row = await firstStagedRow(userId, batch.id);

    expect(row.isDuplicate).toBe(false);
    expect(row.include).toBe(true);
    expect(row.nearDuplicateResult?.outcome).toBe("ambiguous");
    if (row.nearDuplicateResult?.outcome === "ambiguous") {
      expect(row.nearDuplicateResult.candidateCount).toBe(2);
    }

    // Ambiguous evidence never blocks the ledger write.
    const committed = await service.commitBatch(userId, batch.id);
    expect(committed.stats.committed).toBe(1);
    await assertLedgerInvariants(testDb.db);
  });

  it("proves idempotent commit under five identical parallel commit attempts", async () => {
    const userId = "user-concurrency";
    const accountId = await seedAccount(userId, 100_000);
    const rows = [
      includableRow({ rowNumber: 1 }),
      includableRow({ rowNumber: 2 }),
      includableRow({ rowNumber: 3 })
    ];
    const batch = await batches.create(
      userId,
      accountId,
      "concurrency.csv",
      "sha256:concurrency",
      MAPPING
    );
    await stagedRows.insertMany(userId, batch.id, rows);
    await batches.markParsed(userId, batch.id, "staged", {
      total: rows.length,
      staged: rows.length,
      duplicates: 0,
      committed: 0
    });

    // Five raw, identical concurrent commit attempts against the same batch
    // — bypassing the workflow queue/lease entirely, so the only thing that
    // can prevent a double-post here is the v2 fingerprint's unique index
    // (plus the batch status guard for whichever attempts arrive after
    // another has already finished). Every settled outcome must be either a
    // successful commit or the expected "not ready" rejection — never an
    // unhandled unique-violation escaping the retry logic.
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.commitBatch(userId, batch.id))
    );
    expect(settled).toHaveLength(5);
    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.commitBatch>>> =>
        result.status === "fulfilled"
    );
    const rejected = settled.filter((result) => result.status === "rejected");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.every((result) => result.value.status === "committed")).toBe(true);
    for (const failure of rejected) {
      expect(failure.status).toBe("rejected");
      if (failure.status === "rejected") {
        expect(failure.reason).toBeInstanceOf(ImportBatchNotReadyError);
      }
    }

    const posted = await transactions.findMany(userId, { accountId, limit: 20 });
    // Exactly one ledger effect: three transactions, not fifteen.
    expect(posted.items).toHaveLength(rows.length);

    const [account] = await testDb.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    expect(account?.balanceMinor).toBe(100_000 - 2_000 * rows.length);
    await assertLedgerInvariants(testDb.db);
  });
});
