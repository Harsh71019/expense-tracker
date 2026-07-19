import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping } from "@vyaya/shared";
import { Redis } from "ioredis";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { ImportAlreadyCommittedError } from "../../../src/common/errors/import-already-committed.error.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { importBatches } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import { ImportsQueue } from "../../../src/imports/imports.queue.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const TEST_REDIS_URL = "redis://127.0.0.1:6379/9";

class TestRuntimeConfig implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "api" as const,
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

const CSV = "Txn Date,Narration,Amount\n04/07/2026,Chai Point,-20.00\n";

describe("ImportsService.createBatch", () => {
  let testDb: TestDb;
  let service: ImportsService;
  let accounts: AccountRepository;
  let queue: ImportsQueue;
  let flushClient: Redis;
  let accountIdA: string;
  let accountIdB: string;

  beforeAll(async () => {
    flushClient = new Redis(TEST_REDIS_URL);
    await flushClient.flushdb();

    testDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "mapping-owner"]) {
      await insertTestUser(testDb.db, userId);
    }

    const batches = new ImportBatchRepository(testDb.db);
    const stagedRows = new StagedRowRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    accounts = new AccountRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categoryRules = new CategoryRuleRepository(testDb.db);
    queue = new ImportsQueue(new TestRuntimeConfig());
    service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      audit,
      categoryRules,
      queue
    );

    accountIdA = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-a",
          { name: "HDFC Savings", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
    accountIdB = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-b",
          { name: "ICICI Savings", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
  }, 30_000);

  afterAll(async () => {
    await queue.onModuleDestroy();
    await flushClient.flushdb();
    await flushClient.quit();
    await testDb.teardown();
  });

  afterEach(async () => {
    await flushClient.flushdb();
  });

  it("creates a pending batch and enqueues a parse job", async () => {
    const created = await service.createBatch(
      "user-a",
      accountIdA,
      "hdfc-july.csv",
      "text/csv",
      Buffer.from(CSV, "utf8"),
      MAPPING
    );

    expect(created).toMatchObject({ status: "pending", filename: "hdfc-july.csv" });

    const job = await waitForJob(flushClient, created.id);
    expect(job).toBe(true);
  });

  it("rejects the exact same bytes once the prior batch has been committed", async () => {
    const buffer = Buffer.from(CSV + "05/07/2026,Salary,50000.00\n", "utf8");
    const first = await service.createBatch(
      "user-a",
      accountIdA,
      "already-committed.csv",
      "text/csv",
      buffer,
      MAPPING
    );

    // Simulate what the (not-yet-built) commit endpoint will eventually do —
    // no commit endpoint exists yet, so drive the state directly.
    await testDb.db
      .update(importBatches)
      .set({ status: "committed" })
      .where(eq(importBatches.id, first.id));

    await expect(
      service.createBatch(
        "user-a",
        accountIdA,
        "already-committed.csv",
        "text/csv",
        buffer,
        MAPPING
      )
    ).rejects.toThrow(ImportAlreadyCommittedError);
  });

  it("allows re-uploading the exact same bytes after the prior batch was reverted (Gate 3)", async () => {
    const buffer = Buffer.from(CSV + "06/07/2026,Refund,1000.00\n", "utf8");
    const first = await service.createBatch(
      "user-a",
      accountIdA,
      "reverted-then-reimported.csv",
      "text/csv",
      buffer,
      MAPPING
    );

    await testDb.db
      .update(importBatches)
      .set({ status: "reverted" })
      .where(eq(importBatches.id, first.id));

    const second = await service.createBatch(
      "user-a",
      accountIdA,
      "reverted-then-reimported.csv",
      "text/csv",
      buffer,
      MAPPING
    );

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("pending");
  });

  it("does not let one user's committed upload block another user's identical file", async () => {
    const buffer = Buffer.from(CSV, "utf8");
    const ownerBatch = await service.createBatch(
      "user-a",
      accountIdA,
      "shared-bytes.csv",
      "text/csv",
      buffer,
      MAPPING
    );
    await testDb.db
      .update(importBatches)
      .set({ status: "committed" })
      .where(eq(importBatches.id, ownerBatch.id));

    await expect(
      service.createBatch("user-b", accountIdB, "shared-bytes.csv", "text/csv", buffer, MAPPING)
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("returns saved mappings only for an active account owned by the requester", async () => {
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create("mapping-owner", { name: "HDFC", type: "bank", openingBalanceMinor: 0 }, tx)
    );
    const batches = new ImportBatchRepository(testDb.db);
    await batches.create("mapping-owner", account.id, "mapping.csv", "mapping-hash", MAPPING);

    await expect(service.getSavedMapping("mapping-owner", account.id)).resolves.toEqual(MAPPING);
    await expect(service.getSavedMapping("someone-else", account.id)).rejects.toThrow(
      EntityNotFoundError
    );
  });
});

async function waitForJob(redis: Redis, jobId: string, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const exists = await redis.exists(`bull:imports:${jobId}`);
    if (exists === 1) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
