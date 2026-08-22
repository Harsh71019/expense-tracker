import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping } from "@treasury-ops/shared";
import { Redis } from "ioredis";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { BalanceVerifyRepository } from "../../../src/balances/balance-verify.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategorySuggestionRepository } from "../../../src/category-rules/category-suggestion.repository.js";
import { CategorySuggestionService } from "../../../src/category-rules/category-suggestion.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryService } from "../../../src/categories/category.service.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { MetricsService } from "../../../src/common/observability/metrics.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { stagedRows as stagedRowsTable } from "../../../src/common/db/schema/index.js";
import {
  accounts as accountsTable,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import { ImportsQueue } from "../../../src/imports/imports.queue.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { startImportsWorker } from "../../../src/imports/imports.processor.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { focusedTestDouble } from "../../../src/test/mock-drizzle.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const TEST_REDIS_URL = "redis://127.0.0.1:6379/10";

class TestRuntimeConfig implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    LOG_PRETTY: false,
    SERVICE_ROLE: "worker" as const,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    DATABASE_POOL_MAX: 10,
    DATABASE_CONNECTION_TIMEOUT_MS: 5_000,
    DATABASE_QUERY_TIMEOUT_MS: 10_000,
    DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
    DATABASE_LOCK_TIMEOUT_MS: 5_000,
    DATABASE_IDLE_IN_TXN_TIMEOUT_MS: 30_000,
    REDIS_URL: TEST_REDIS_URL,
    READINESS_TIMEOUT_MS: 2_000,
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: 15_000,
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "test-sha",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false,
    DISABLE_RATE_LIMITING: false
  };

  trustedOrigins(): string[] {
    return ["http://localhost:3000"];
  }
}

const MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

const CSV = [
  "Txn Date,Narration,Amount",
  "04/07/2026,Chai Point,-20.00",
  "05/07/2026,Salary,50000.00"
].join("\n");

describe("Imports parse pipeline (real BullMQ worker against real Redis)", () => {
  let testDb: TestDb;
  let batches: ImportBatchRepository;
  let flushClient: Redis;
  let worker: ReturnType<typeof startImportsWorker>;
  let backgroundQueue: ImportsQueue;
  let service: ImportsService;
  let accountIdA: string;
  let accountIdSuggest: string;

  beforeAll(async () => {
    flushClient = new Redis(TEST_REDIS_URL);
    await flushClient.flushdb();

    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-suggest");

    batches = new ImportBatchRepository(testDb.db);
    const stagedRows = new StagedRowRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categoryRules = new CategoryRuleRepository(testDb.db);
    const config = new TestRuntimeConfig();
    backgroundQueue = new ImportsQueue(config);
    service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      new CategoryRepository(testDb.db),
      audit,
      new CategorySuggestionService(
        categoryRules,
        new CategorySuggestionRepository(testDb.db),
        new CategoryService(new CategoryRepository(testDb.db))
      ),
      focusedTestDouble<MetricsService>({ recordCategorySuggestions: () => undefined })
    );
    const logger = { log: () => undefined, error: () => undefined };

    accountIdA = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-a",
          { name: "HDFC Savings", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
    accountIdSuggest = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-suggest",
          { name: "HDFC Savings", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;

    worker = startImportsWorker(config, service, logger);
    await worker.waitUntilReady();
  }, 30_000);

  afterAll(async () => {
    await worker.close();
    await backgroundQueue.onModuleDestroy();
    await flushClient.flushdb();
    await flushClient.quit();
    await testDb.teardown();
  });

  afterEach(async () => {
    await flushClient.flushdb();
  });

  it("parses an uploaded CSV into staged_rows and flips the batch to staged", async () => {
    const batch = await service.createBatch(
      "user-a",
      accountIdA,
      "hdfc-july.csv",
      "text/csv",
      Buffer.from(CSV, "utf8"),
      MAPPING
    );

    const [claim] = await withTxn(testDb.db, (tx) =>
      batches.systemClaimReady(new Date(), new Date(Date.now() + 60_000), 1, tx)
    );
    if (claim === undefined) throw new Error("Expected the parse workflow to be claimable.");
    await backgroundQueue.enqueueWorkflow(claim);

    const staged = await waitForStatus(batches, batch.id, "staged");
    expect(staged).toMatchObject({
      status: "staged",
      stats: { total: 2, staged: 2, duplicates: 0, committed: 0 }
    });

    const rows = await testDb.db
      .select()
      .from(stagedRowsTable)
      .where(eq(stagedRowsTable.batchId, batch.id))
      .orderBy(stagedRowsTable.rowNumber);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      isDuplicate: false,
      parsedAmountMinor: 2_000,
      parsedType: "expense",
      parsedDescription: "Chai Point"
    });
    expect(rows[1]).toMatchObject({
      rowNumber: 2,
      parsedAmountMinor: 5_000_000,
      parsedType: "income",
      parsedDescription: "Salary"
    });
  }, 20_000);

  it("re-parsing the same batch (a BullMQ retry) clears and re-derives staged_rows instead of duplicating them", async () => {
    const stagedRows = new StagedRowRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categoryRules = new CategoryRuleRepository(testDb.db);
    const service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      new CategoryRepository(testDb.db),
      audit,
      new CategorySuggestionService(
        categoryRules,
        new CategorySuggestionRepository(testDb.db),
        new CategoryService(new CategoryRepository(testDb.db))
      ),
      focusedTestDouble<MetricsService>({ recordCategorySuggestions: () => undefined })
    );

    const batch = await batches.create(
      "user-a",
      accountIdA,
      "retry.csv",
      "sha256:retry-e2e",
      MAPPING
    );

    await service.parseFile(batch.id, "user-a", accountIdA, MAPPING, CSV);
    await service.parseFile(batch.id, "user-a", accountIdA, MAPPING, CSV);

    expect(
      (await testDb.db.select().from(stagedRowsTable).where(eq(stagedRowsTable.batchId, batch.id)))
        .length
    ).toBe(2);
  });

  it("applies a matching category rule's suggestion during parse", async () => {
    const stagedRows = new StagedRowRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categoryRules = new CategoryRuleRepository(testDb.db);
    const service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      new CategoryRepository(testDb.db),
      audit,
      new CategorySuggestionService(
        categoryRules,
        new CategorySuggestionRepository(testDb.db),
        new CategoryService(new CategoryRepository(testDb.db))
      ),
      focusedTestDouble<MetricsService>({ recordCategorySuggestions: () => undefined })
    );

    const categories = new CategoryRepository(testDb.db);
    const foodCategoryId = (
      await categories.create("user-suggest", { name: "Food", kind: "expense" })
    ).id;
    await categoryRules.create("user-suggest", { pattern: "Chai", categoryId: foodCategoryId });
    await categoryRules.create("user-suggest", { pattern: "Salary", categoryId: foodCategoryId });

    const batch = await batches.create(
      "user-suggest",
      accountIdSuggest,
      "suggest.csv",
      "sha256:suggest-e2e",
      MAPPING
    );
    await service.parseFile(batch.id, "user-suggest", accountIdSuggest, MAPPING, CSV);

    const page = await stagedRows.findByBatchId("user-suggest", batch.id, undefined, 10);
    expect(page.items[0]).toMatchObject({ suggestedCategoryId: foodCategoryId });
    expect(page.items[1]?.suggestedCategoryId).toBeUndefined();
  });

  it("suggests exact private history without leaking that history to another tenant", async () => {
    const categories = new CategoryRepository(testDb.db);
    const foodCategoryId = (
      await categories.create("user-suggest", { name: "Private history food", kind: "expense" })
    ).id;
    const transactions = new TransactionService(
      testDb.db,
      new AccountRepository(testDb.db),
      categories,
      new TransactionRepository(testDb.db),
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined, error: () => undefined }
    );
    for (const [index, reference] of ["111111111111", "222222222222", "333333333333"].entries()) {
      await transactions.create(
        "user-suggest",
        {
          accountId: accountIdSuggest,
          categoryId: foodCategoryId,
          type: "expense",
          amountMinor: 10_000 + index,
          occurredAt: new Date(Date.UTC(2026, 5, index + 1)),
          description: `UPI/${reference}/SWIGGY/order ${index + 1}`,
          tags: []
        },
        undefined
      );
    }

    const privateBatch = await batches.create(
      "user-suggest",
      accountIdSuggest,
      "private-history.csv",
      "sha256:private-history",
      MAPPING
    );
    const targetCsv = [
      "Txn Date,Narration,Amount",
      "04/07/2026,UPI/444444444444/SWIGGY/order 4,-100.00"
    ].join("\n");
    await service.parseFile(privateBatch.id, "user-suggest", accountIdSuggest, MAPPING, targetCsv);
    const privateRows = await new StagedRowRepository(testDb.db).findByBatchId(
      "user-suggest",
      privateBatch.id,
      undefined,
      10
    );
    expect(privateRows.items[0]).toMatchObject({
      suggestedCategoryId: foodCategoryId,
      categorySuggestion: {
        categoryId: foodCategoryId,
        confidenceBps: 10_000,
        method: "exact_counterparty",
        evidenceCount: 3,
        algorithmVersion: 1
      }
    });

    const otherBatch = await batches.create(
      "user-a",
      accountIdA,
      "other-tenant.csv",
      "sha256:other-tenant",
      MAPPING
    );
    await service.parseFile(otherBatch.id, "user-a", accountIdA, MAPPING, targetCsv);
    const otherRows = await new StagedRowRepository(testDb.db).findByBatchId(
      "user-a",
      otherBatch.id,
      undefined,
      10
    );
    expect(otherRows.items[0]?.categorySuggestion).toBeUndefined();
    expect(otherRows.items[0]?.suggestedCategoryId).toBeUndefined();

    await assertInvariants(testDb);
  });
});

async function assertInvariants(testDb: TestDb): Promise<void> {
  const [accounts, transactions, deltas] = await Promise.all([
    testDb.db.select().from(accountsTable),
    testDb.db.select().from(transactionsTable),
    new BalanceVerifyRepository(testDb.db).sumDeltasByAccount()
  ]);
  for (const account of accounts) {
    expect(account.openingBalanceMinor + (deltas.get(account.id) ?? 0)).toBe(account.balanceMinor);
  }
  for (const transaction of transactions) {
    if (transaction.status === "posted") {
      expect(transaction.reversalOf).toBeNull();
      expect(transaction.reversedBy).toBeNull();
    }
  }
}

async function waitForStatus(
  repository: ImportBatchRepository,
  batchId: string,
  status: "staged" | "failed",
  timeoutMs = 10_000
): Promise<Awaited<ReturnType<ImportBatchRepository["findById"]>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const batch = await repository.findById("user-a", batchId);
    if (batch?.status === status) return batch;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for batch ${batchId} to reach status "${status}".`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
