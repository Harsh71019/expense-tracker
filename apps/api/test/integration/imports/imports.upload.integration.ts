import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { CategoryRuleRepository } from "../../../src/category-rules/category-rule.repository.js";
import { CategorySuggestionRepository } from "../../../src/category-rules/category-suggestion.repository.js";
import { CategorySuggestionService } from "../../../src/category-rules/category-suggestion.service.js";
import { ImportAlreadyCommittedError } from "../../../src/common/errors/import-already-committed.error.js";
import { importBatches } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { MetricsService } from "../../../src/common/observability/metrics.service.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import { ImportsService } from "../../../src/imports/imports.service.js";
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

const CSV = "Txn Date,Narration,Amount\n04/07/2026,Chai Point,-20.00\n";

describe("ImportsService.createBatch", () => {
  let testDb: TestDb;
  let service: ImportsService;
  let accounts: AccountRepository;
  let batches: ImportBatchRepository;
  let accountIdA: string;
  let accountIdB: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "mapping-owner"]) {
      await insertTestUser(testDb.db, userId);
    }

    batches = new ImportBatchRepository(testDb.db);
    const stagedRows = new StagedRowRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    accounts = new AccountRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    const categoryRules = new CategoryRuleRepository(testDb.db);
    service = new ImportsService(
      testDb.db,
      batches,
      stagedRows,
      transactions,
      accounts,
      new CategoryRepository(testDb.db),
      audit,
      new CategorySuggestionService(categoryRules, new CategorySuggestionRepository(testDb.db)),
      focusedTestDouble<MetricsService>({ recordCategorySuggestions: () => undefined })
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
    await testDb.teardown();
  });

  it("atomically creates a durable pending parse workflow without a Redis handoff", async () => {
    const created = await service.createBatch(
      "user-a",
      accountIdA,
      "hdfc-july.csv",
      "text/csv",
      Buffer.from(CSV, "utf8"),
      MAPPING
    );

    expect(created).toMatchObject({ status: "pending_parse", filename: "hdfc-july.csv" });
    await expect(batches.findWorkflowPayload("user-a", created.id)).resolves.toMatchObject({
      accountId: accountIdA,
      mapping: MAPPING,
      fileContentBase64: Buffer.from(CSV, "utf8").toString("base64")
    });
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
    expect(second.status).toBe("pending_parse");
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
    ).resolves.toMatchObject({ status: "pending_parse" });
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

  it("joins five concurrent commit requests to exactly one durable workflow", async () => {
    const batch = await batches.create(
      "user-a",
      accountIdA,
      "concurrent-commit.csv",
      "sha256:concurrent-commit",
      MAPPING
    );
    await batches.markParsed("user-a", batch.id, "staged", {
      total: 1,
      staged: 1,
      duplicates: 0,
      committed: 0
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.requestCommit("user-a", batch.id))
    );

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.status === "commit_queued")).toBe(true);
    const claims = await withTxn(testDb.db, (tx) =>
      batches.systemClaimReady(new Date(), new Date(Date.now() + 60_000), 100, tx)
    );
    const claim = claims.find((candidate) => candidate.batchId === batch.id);
    expect(claim).toMatchObject({
      batchId: batch.id,
      userId: "user-a",
      operation: "commit"
    });
  });
});
