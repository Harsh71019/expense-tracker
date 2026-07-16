import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";
import type { ColumnMapping } from "@vyaya/shared";
import { Redis } from "ioredis";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import { ImportsQueue } from "../../../src/imports/imports.queue.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { startImportsWorker } from "../../../src/imports/imports.processor.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";

const TEST_REDIS_URL = "redis://127.0.0.1:6379/9";

class TestRuntimeConfig implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "worker" as const,
    MONGODB_URI: "mongodb://localhost:27017/test",
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
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let batches: ImportBatchRepository | undefined;
  let flushClient: Redis | undefined;
  let worker: ReturnType<typeof startImportsWorker> | undefined;
  let backgroundQueue: ImportsQueue | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_imports_parse_test")).asPromise();
    flushClient = new Redis(TEST_REDIS_URL);
    await flushClient.flushdb();

    batches = new ImportBatchRepository(connection);
    const stagedRows = new StagedRowRepository(connection);
    const transactions = new TransactionRepository(connection);
    const accounts = new AccountRepository(connection);
    const audit = new AuditRepository(connection);
    const config = new TestRuntimeConfig();
    backgroundQueue = new ImportsQueue(config);
    const service = new ImportsService(
      connection,
      batches,
      stagedRows,
      transactions,
      accounts,
      audit,
      backgroundQueue
    );
    const logger = { log: () => undefined, error: () => undefined };

    worker = startImportsWorker(config, service, logger);
    await worker.waitUntilReady();
  }, 30_000);

  afterAll(async () => {
    if (worker !== undefined) await worker.close();
    if (backgroundQueue !== undefined) await backgroundQueue.onModuleDestroy();
    if (flushClient !== undefined) {
      await flushClient.flushdb();
      await flushClient.quit();
    }
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  afterEach(async () => {
    if (flushClient !== undefined) await flushClient.flushdb();
  });

  it("parses an uploaded CSV into staged_rows and flips the batch to staged", async () => {
    const repository = importBatchRepository(batches);
    const batch = await repository.create(
      "user-a",
      "0123456789abcdef01234567",
      "hdfc-july.csv",
      "sha256:parse-e2e",
      MAPPING
    );

    const config = new TestRuntimeConfig();
    const queue = new ImportsQueue(config);
    await queue.enqueueParse({
      batchId: batch.id,
      userId: "user-a",
      accountId: "0123456789abcdef01234567",
      mapping: MAPPING,
      fileContentBase64: Buffer.from(CSV, "utf8").toString("base64")
    });

    const staged = await waitForStatus(repository, batch.id, "staged");
    expect(staged).toMatchObject({
      status: "staged",
      stats: { total: 2, staged: 2, duplicates: 0, committed: 0 }
    });

    const rows = await connectedDatabase(connection)
      .collection("staged_rows")
      .find({ batchId: new Types.ObjectId(batch.id) })
      .sort({ rowNumber: 1 })
      .toArray();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      isDuplicate: false,
      parsed: { amountMinor: 2_000, type: "expense", description: "Chai Point" }
    });
    expect(rows[1]).toMatchObject({
      rowNumber: 2,
      parsed: { amountMinor: 5_000_000, type: "income", description: "Salary" }
    });

    await queue.onModuleDestroy();
  }, 20_000);

  it("re-parsing the same batch (a BullMQ retry) clears and re-derives staged_rows instead of duplicating them", async () => {
    const repository = importBatchRepository(batches);
    const database = connectedDatabase(connection);
    const stagedRows = new StagedRowRepository(nonNullConnection(connection));
    const transactions = new TransactionRepository(nonNullConnection(connection));
    const accounts = new AccountRepository(nonNullConnection(connection));
    const audit = new AuditRepository(nonNullConnection(connection));
    const service = new ImportsService(
      nonNullConnection(connection),
      repository,
      stagedRows,
      transactions,
      accounts,
      audit,
      nonNullQueue(backgroundQueue)
    );

    const batch = await repository.create(
      "user-a",
      "0123456789abcdef01234567",
      "retry.csv",
      "sha256:retry-e2e",
      MAPPING
    );

    await service.parseFile(batch.id, "user-a", "0123456789abcdef01234567", MAPPING, CSV);
    await service.parseFile(batch.id, "user-a", "0123456789abcdef01234567", MAPPING, CSV);

    expect(
      await database
        .collection("staged_rows")
        .countDocuments({ batchId: new Types.ObjectId(batch.id) })
    ).toBe(2);
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

function importBatchRepository(
  repository: ImportBatchRepository | undefined
): ImportBatchRepository {
  if (repository === undefined) {
    throw new Error("Import batch repository is not ready");
  }
  return repository;
}

function nonNullQueue(queue: ImportsQueue | undefined): ImportsQueue {
  if (queue === undefined) {
    throw new Error("Imports queue is not ready");
  }
  return queue;
}

function nonNullConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) {
    throw new Error("MongoDB connection is not ready");
  }
  return connection;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = nonNullConnection(connection).db;
  if (database === undefined) {
    throw new Error("MongoDB database is not ready");
  }
  return database;
}
