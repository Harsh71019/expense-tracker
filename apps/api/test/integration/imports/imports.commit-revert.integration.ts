import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";
import type { ColumnMapping } from "@vyaya/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { ImportBatchNotReadyError } from "../../../src/common/errors/import-batch-not-ready.error.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { ImportsQueue } from "../../../src/imports/imports.queue.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import type { NewStagedRow } from "../../../src/imports/staged-row.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";

class TestRuntimeConfig implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "api" as const,
    MONGODB_URI: "mongodb://localhost:27017/test",
    REDIS_URL: "redis://127.0.0.1:6379/9",
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
    dedupeHash: `hash-${Math.random().toString(36).slice(2)}`,
    problems: [],
    isDuplicate: false,
    include: true,
    ...overrides
  };
}

describe("ImportsService commit/revert", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let service: ImportsService | undefined;
  let batches: ImportBatchRepository | undefined;
  let stagedRows: StagedRowRepository | undefined;
  let transactions: TransactionRepository | undefined;
  let accounts: AccountRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_imports_commit_revert_test")
    ).asPromise();

    batches = new ImportBatchRepository(connection);
    stagedRows = new StagedRowRepository(connection);
    transactions = new TransactionRepository(connection);
    accounts = new AccountRepository(connection);
    const audit = new AuditRepository(connection);
    const categoryRules = new CategoryRuleRepository(connection);
    const queue = new ImportsQueue(new TestRuntimeConfig());
    service = new ImportsService(
      connection,
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
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  async function seedAccount(userId: string, openingBalanceMinor = 100_000): Promise<string> {
    const account = await withTxn(nonNull(connection), (session) =>
      nonNull(accounts).create(
        userId,
        { name: "Test Account", type: "bank", openingBalanceMinor },
        session
      )
    );
    return account.id;
  }

  async function seedStagedBatch(
    userId: string,
    accountId: string,
    rows: NewStagedRow[]
  ): Promise<string> {
    const batch = await nonNull(batches).create(
      userId,
      accountId,
      "statement.csv",
      `sha256:${Math.random().toString(36).slice(2)}`,
      MAPPING
    );
    await nonNull(stagedRows).insertMany(batch.id, rows);
    await nonNull(batches).markParsed(batch.id, "staged", {
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

    const committed = await nonNull(service).commitBatch(userId, batchId);

    expect(committed.status).toBe("committed");
    expect(committed.committedAt).toBeInstanceOf(Date);
    expect(committed.stats.committed).toBe(2);

    const posted = await nonNull(transactions).findPostedByImportBatchId(userId, batchId);
    expect(posted).toHaveLength(2);
    expect(posted.every((txn) => txn.source === "csv_import")).toBe(true);

    const account = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ _id: new Types.ObjectId(accountId) });
    // net = -2_000 (expense) + 5_000 (income) = +3_000
    expect(account).toMatchObject({ balanceMinor: 103_000 });

    const auditEntries = await connectedDatabase(connection)
      .collection("audit_log")
      .find({ userId, action: "import.commit" })
      .toArray();
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
    const [firstRow] = await nonNull(stagedRows).findIncludableForBatch(batchId);
    await withTxn(nonNull(connection), (session) =>
      nonNull(transactions).insertImportedRows(
        userId,
        accountId,
        batchId,
        [
          {
            occurredAt: nonNull(firstRow).parsed?.occurredAt ?? new Date(),
            amountMinor: 2_000,
            type: "expense",
            description: "Chai",
            dedupeHash: nonNull(nonNull(firstRow).dedupeHash)
          }
        ],
        session
      )
    );
    const committed = await nonNull(service).commitBatch(userId, batchId);

    expect(committed.status).toBe("committed");
    const posted = await nonNull(transactions).findPostedByImportBatchId(userId, batchId);
    // Exactly 3 transactions total — the pre-landed one was not duplicated.
    expect(posted).toHaveLength(rows.length);
    const dedupeHashes = new Set(rows.map((row) => row.dedupeHash));
    expect(new Set(posted.map((txn) => txn.description))).toEqual(new Set(["Chai"]));
    expect(dedupeHashes.size).toBe(3);
  });

  it("rejects committing a batch that is not staged", async () => {
    const userId = "user-commit-guard";
    const accountId = await seedAccount(userId);
    const batch = await nonNull(batches).create(
      userId,
      accountId,
      "pending.csv",
      `sha256:${Math.random().toString(36).slice(2)}`,
      MAPPING
    );

    await expect(nonNull(service).commitBatch(userId, batch.id)).rejects.toThrow(
      ImportBatchNotReadyError
    );
  });

  it("404s committing another user's batch", async () => {
    const ownerId = "user-commit-owner";
    const accountId = await seedAccount(ownerId);
    const batchId = await seedStagedBatch(ownerId, accountId, [includableRow()]);

    await expect(nonNull(service).commitBatch("someone-else", batchId)).rejects.toThrow(
      EntityNotFoundError
    );
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
    await nonNull(service).commitBatch(userId, batchId);

    const balanceAfterCommit = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ _id: new Types.ObjectId(accountId) });
    expect(balanceAfterCommit).toMatchObject({ balanceMinor: 103_000 });

    const reverted = await nonNull(service).revertBatch(userId, batchId);

    expect(reverted.status).toBe("reverted");
    expect(reverted.revertedAt).toBeInstanceOf(Date);

    const balanceAfterRevert = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ _id: new Types.ObjectId(accountId) });
    expect(balanceAfterRevert).toMatchObject({ balanceMinor: 100_000 });

    const stillPosted = await nonNull(transactions).findPostedByImportBatchId(userId, batchId);
    expect(stillPosted).toHaveLength(0);

    const auditEntries = await connectedDatabase(connection)
      .collection("audit_log")
      .find({ userId, action: "import.revert" })
      .toArray();
    expect(auditEntries.length).toBeGreaterThan(0);
  });

  it("is resumable: re-reverting after a partial reversal only reverses what's left", async () => {
    const userId = "user-revert-resume";
    const accountId = await seedAccount(userId, 100_000);
    const batchId = await seedStagedBatch(userId, accountId, [
      includableRow({ rowNumber: 1 }),
      includableRow({ rowNumber: 2 })
    ]);
    await nonNull(service).commitBatch(userId, batchId);

    // Simulate a crash mid-revert: reverse only the first posted txn
    // directly, leaving the batch status at "committed" (as a real
    // mid-revert crash would).
    const posted = await nonNull(transactions).findPostedByImportBatchId(userId, batchId);
    const [firstPosted] = posted;
    await withTxn(nonNull(connection), (session) =>
      nonNull(transactions).insertBulkReversals(userId, [nonNull(firstPosted)], session)
    );

    const reverted = await nonNull(service).revertBatch(userId, batchId);

    expect(reverted.status).toBe("reverted");
    const stillPosted = await nonNull(transactions).findPostedByImportBatchId(userId, batchId);
    expect(stillPosted).toHaveLength(0);

    // Exactly one reversal per original — not two for the pre-reversed one.
    const reversals = await connectedDatabase(connection)
      .collection("transactions")
      .find({ userId, reversalOf: { $in: posted.map((txn) => new Types.ObjectId(txn.id)) } })
      .toArray();
    expect(reversals).toHaveLength(2);
  });

  it("rejects reverting a batch that is not committed", async () => {
    const userId = "user-revert-guard";
    const accountId = await seedAccount(userId);
    const batchId = await seedStagedBatch(userId, accountId, [includableRow()]);

    await expect(nonNull(service).revertBatch(userId, batchId)).rejects.toThrow(
      ImportBatchNotReadyError
    );
  });

  it("404s reverting another user's batch", async () => {
    const ownerId = "user-revert-owner";
    const accountId = await seedAccount(ownerId);
    const batchId = await seedStagedBatch(ownerId, accountId, [includableRow()]);
    await nonNull(service).commitBatch(ownerId, batchId);

    await expect(nonNull(service).revertBatch("someone-else", batchId)).rejects.toThrow(
      EntityNotFoundError
    );
  });
});

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
