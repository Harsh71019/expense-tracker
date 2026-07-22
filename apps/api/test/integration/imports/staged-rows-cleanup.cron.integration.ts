import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { stagedRows } from "../../../src/common/db/schema/index.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { StagedRowsCleanupCron } from "../../../src/imports/staged-rows-cleanup.cron.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined };

const MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

describe("StagedRowsCleanupCron", () => {
  let testDb: TestDb;
  let batchId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/16";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    const accounts = new AccountRepository(testDb.db);
    const accountId = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-a",
          { name: "HDFC Savings", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
    const batches = new ImportBatchRepository(testDb.db);
    batchId = (
      await batches.create("user-a", accountId, "statement.csv", "sha256:cleanup-test", MAPPING)
    ).id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function newCron(serviceRole: "api" | "worker"): StagedRowsCleanupCron {
    process.env.SERVICE_ROLE = serviceRole;
    return new StagedRowsCleanupCron(testDb.db, new RuntimeConfigService(), NOOP_LOGGER);
  }

  async function insertStagedRow(rowNumber: number, createdAt: Date): Promise<{ id: string }> {
    const [row] = await testDb.db
      .insert(stagedRows)
      .values({
        batchId,
        rowNumber,
        raw: { "Txn Date": "04/07/2026", Narration: "Chai", Amount: "-20.00" },
        problems: [],
        isDuplicate: false,
        include: false,
        createdAt
      })
      .returning({ id: stagedRows.id });
    if (row === undefined) throw new Error("Staged row insert did not return a row.");
    return row;
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await insertStagedRow(1, eightDaysAgo);

    await newCron("api").run();

    const rows = await testDb.db.select().from(stagedRows).where(eq(stagedRows.batchId, batchId));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("deletes rows older than 7 days and leaves newer ones alone", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await insertStagedRow(2, eightDaysAgo);
    const recent = await insertStagedRow(3, oneDayAgo);

    await newCron("worker").run();

    const remaining = await testDb.db
      .select()
      .from(stagedRows)
      .where(eq(stagedRows.batchId, batchId));
    expect(remaining.map((row) => row.id)).toEqual([recent.id]);
  });
});
