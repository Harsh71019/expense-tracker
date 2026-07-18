import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";
import type { ColumnMapping } from "@vyaya/shared";
import { Redis } from "ioredis";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { ImportAlreadyCommittedError } from "../../../src/common/errors/import-already-committed.error.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
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
    MONGODB_URI: "mongodb://localhost:27017/test",
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
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let pgTestDb: TestDb | undefined;
  let service: ImportsService | undefined;
  let batches: ImportBatchRepository | undefined;
  let accounts: AccountRepository | undefined;
  let queue: ImportsQueue | undefined;
  let flushClient: Redis | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_imports_upload_test")).asPromise();
    flushClient = new Redis(TEST_REDIS_URL);
    await flushClient.flushdb();

    // import_batches/staged_rows are still Mongo (Tasks 18/19 not done);
    // accounts/transactions/audit_log/category_rules moved to Postgres (Tasks 11/15).
    pgTestDb = await createTestDb();
    await insertTestUser(pgTestDb.db, "mapping-owner");

    batches = new ImportBatchRepository(connection);
    const stagedRows = new StagedRowRepository(connection);
    const transactions = new TransactionRepository(pgTestDb.db);
    accounts = new AccountRepository(pgTestDb.db);
    const audit = new AuditRepository(pgTestDb.db);
    const categoryRules = new CategoryRuleRepository(pgTestDb.db);
    queue = new ImportsQueue(new TestRuntimeConfig());
    service = new ImportsService(
      connection,
      pgTestDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      audit,
      categoryRules,
      queue
    );
  }, 30_000);

  afterAll(async () => {
    if (queue !== undefined) await queue.onModuleDestroy();
    if (flushClient !== undefined) {
      await flushClient.flushdb();
      await flushClient.quit();
    }
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
    if (pgTestDb !== undefined) await pgTestDb.teardown();
  });

  afterEach(async () => {
    if (flushClient !== undefined) await flushClient.flushdb();
  });

  it("creates a pending batch and enqueues a parse job", async () => {
    const created = await nonNull(service).createBatch(
      "user-a",
      "0123456789abcdef01234567",
      "hdfc-july.csv",
      "text/csv",
      Buffer.from(CSV, "utf8"),
      MAPPING
    );

    expect(created).toMatchObject({ status: "pending", filename: "hdfc-july.csv" });

    const job = await waitForJob(nonNull(flushClient), created.id);
    expect(job).toBe(true);
  });

  it("rejects the exact same bytes once the prior batch has been committed", async () => {
    const buffer = Buffer.from(CSV + "05/07/2026,Salary,50000.00\n", "utf8");
    const first = await nonNull(service).createBatch(
      "user-a",
      "0123456789abcdef01234567",
      "already-committed.csv",
      "text/csv",
      buffer,
      MAPPING
    );

    // Simulate what the (not-yet-built) commit endpoint will eventually do —
    // no commit endpoint exists yet, so drive the state directly.
    await connectedDatabase(connection)
      .collection("import_batches")
      .updateOne({ _id: new Types.ObjectId(first.id) }, { $set: { status: "committed" } });

    await expect(
      nonNull(service).createBatch(
        "user-a",
        "0123456789abcdef01234567",
        "already-committed.csv",
        "text/csv",
        buffer,
        MAPPING
      )
    ).rejects.toThrow(ImportAlreadyCommittedError);
  });

  it("allows re-uploading the exact same bytes after the prior batch was reverted (Gate 3)", async () => {
    const buffer = Buffer.from(CSV + "06/07/2026,Refund,1000.00\n", "utf8");
    const first = await nonNull(service).createBatch(
      "user-a",
      "0123456789abcdef01234567",
      "reverted-then-reimported.csv",
      "text/csv",
      buffer,
      MAPPING
    );

    await connectedDatabase(connection)
      .collection("import_batches")
      .updateOne({ _id: new Types.ObjectId(first.id) }, { $set: { status: "reverted" } });

    const second = await nonNull(service).createBatch(
      "user-a",
      "0123456789abcdef01234567",
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
    const ownerBatch = await nonNull(service).createBatch(
      "user-a",
      "0123456789abcdef01234567",
      "shared-bytes.csv",
      "text/csv",
      buffer,
      MAPPING
    );
    await connectedDatabase(connection)
      .collection("import_batches")
      .updateOne({ _id: new Types.ObjectId(ownerBatch.id) }, { $set: { status: "committed" } });

    await expect(
      nonNull(service).createBatch(
        "user-b",
        "0123456789abcdef01234568",
        "shared-bytes.csv",
        "text/csv",
        buffer,
        MAPPING
      )
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("returns saved mappings only for an active account owned by the requester", async () => {
    const account = await withTxn(nonNull(pgTestDb).db, (tx) =>
      nonNull(accounts).create(
        "mapping-owner",
        { name: "HDFC", type: "bank", openingBalanceMinor: 0 },
        tx
      )
    );
    await connectedDatabase(connection)
      .collection("import_batches")
      .insertOne({
        userId: "mapping-owner",
        accountId: account.id,
        filename: "mapping.csv",
        fileHash: "mapping-hash",
        mapping: MAPPING,
        status: "staged",
        stats: { total: 0, staged: 0, duplicates: 0, committed: 0 },
        createdAt: new Date(),
        updatedAt: new Date()
      });

    await expect(nonNull(service).getSavedMapping("mapping-owner", account.id)).resolves.toEqual(
      MAPPING
    );
    await expect(nonNull(service).getSavedMapping("someone-else", account.id)).rejects.toThrow(
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

function nonNull<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Test fixture is not ready");
  }
  return value;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = nonNull(connection).db;
  if (database === undefined) {
    throw new Error("MongoDB database is not ready");
  }
  return database;
}
