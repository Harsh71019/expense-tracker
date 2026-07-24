import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping } from "@treasury-ops/shared";
import { Redis } from "ioredis";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { stagedRows as stagedRowsTable } from "../../../src/common/db/schema/index.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import { ImportsQueue } from "../../../src/imports/imports.queue.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { startImportsWorker } from "../../../src/imports/imports.processor.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const TEST_REDIS_URL = "redis://127.0.0.1:6379/10";

class TestRuntimeConfig implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "worker" as const,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: TEST_REDIS_URL,
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "test-sha",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false
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
    const service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      new CategoryRepository(testDb.db),
      audit,
      categoryRules,
      backgroundQueue
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
    const batch = await batches.create(
      "user-a",
      accountIdA,
      "hdfc-july.csv",
      "sha256:parse-e2e",
      MAPPING
    );

    const config = new TestRuntimeConfig();
    const queue = new ImportsQueue(config);
    await queue.enqueueParse({
      batchId: batch.id,
      userId: "user-a",
      accountId: accountIdA,
      mapping: MAPPING,
      fileContentBase64: Buffer.from(CSV, "utf8").toString("base64")
    });

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

    await queue.onModuleDestroy();
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
      categoryRules,
      backgroundQueue
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
      categoryRules,
      backgroundQueue
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

    const page = await stagedRows.findByBatchId(batch.id, undefined, 10);
    expect(page.items[0]).toMatchObject({ suggestedCategoryId: foodCategoryId });
    expect(page.items[1]?.suggestedCategoryId).toBeUndefined();
  });
});

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
