import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnMapping } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

describe("ImportBatchRepository", () => {
  let testDb: TestDb;
  let batches: ImportBatchRepository;
  let accountId: string;
  let mappingAccountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of ["user-a", "user-b", "user-list", "someone-else", "user-mapping"]) {
      await insertTestUser(testDb.db, userId);
    }
    batches = new ImportBatchRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    accountId = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-a",
          { name: "Test Account", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
    mappingAccountId = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-mapping",
          { name: "Mapping Account", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a batch pending parse, with zeroed stats", async () => {
    const batch = await batches.create("user-a", accountId, "hdfc-july.csv", "sha256:abc", MAPPING);

    expect(batch).toMatchObject({
      userId: "user-a",
      filename: "hdfc-july.csv",
      fileHash: "sha256:abc",
      status: "pending",
      stats: { total: 0, staged: 0, duplicates: 0, committed: 0 }
    });
  });

  it("keeps batches isolated by user and scoped lookups fail closed", async () => {
    const batch = await batches.create(
      "user-a",
      accountId,
      "isolated.csv",
      "sha256:isolated",
      MAPPING
    );

    expect(await batches.findById("user-a", batch.id)).toMatchObject({ id: batch.id });
    expect(await batches.findById("user-b", batch.id)).toBeNull();
  });

  it("finds an existing batch by fileHash, scoped to the user — the re-upload guard", async () => {
    await batches.create("user-a", accountId, "dupe.csv", "sha256:dupe-check", MAPPING);

    expect(await batches.findByFileHash("user-a", "sha256:dupe-check")).toMatchObject({
      filename: "dupe.csv"
    });
    expect(await batches.findByFileHash("user-b", "sha256:dupe-check")).toBeNull();
    expect(await batches.findByFileHash("user-a", "sha256:never-uploaded")).toBeNull();
  });

  it("markParsed only transitions a batch that is still pending", async () => {
    const batch = await batches.create(
      "user-a",
      accountId,
      "transitions.csv",
      "sha256:transitions",
      MAPPING
    );

    await batches.markParsed("user-a", batch.id, "staged", {
      total: 3,
      staged: 2,
      duplicates: 1,
      committed: 0
    });
    const staged = await batches.findById("user-a", batch.id);
    expect(staged).toMatchObject({ status: "staged", stats: { total: 3, staged: 2 } });

    // A second markParsed call (e.g. a duplicate job delivery) must not clobber
    // an already-resolved batch — the filter requires status: "pending".
    await batches.markParsed("user-a", batch.id, "failed", {
      total: 0,
      staged: 0,
      duplicates: 0,
      committed: 0
    });
    const stillStaged = await batches.findById("user-a", batch.id);
    expect(stillStaged).toMatchObject({ status: "staged", stats: { total: 3, staged: 2 } });
  });

  it("durably records terminal parse exhaustion and remains tenant scoped", async () => {
    const batch = await batches.create(
      "user-a",
      accountId,
      "terminal.csv",
      "sha256:terminal",
      MAPPING
    );

    await batches.markTerminalParseFailure("user-b", batch.id);
    expect(await batches.findById("user-a", batch.id)).toMatchObject({ status: "pending" });

    await batches.markTerminalParseFailure("user-a", batch.id);
    const failed = await batches.findById("user-a", batch.id);
    expect(failed).toMatchObject({
      status: "failed",
      failureCode: "parse_retries_exhausted"
    });
    expect(failed?.failedAt).toBeInstanceOf(Date);
  });

  it("lists a user's batches newest first, scoped to that user", async () => {
    const first = await batches.create(
      "user-list",
      accountId,
      "first.csv",
      "sha256:list-1",
      MAPPING
    );
    const second = await batches.create(
      "user-list",
      accountId,
      "second.csv",
      "sha256:list-2",
      MAPPING
    );
    await batches.create("someone-else", accountId, "not-mine.csv", "sha256:list-3", MAPPING);

    const list = await batches.list("user-list");
    expect(list.map((batch) => batch.id)).toEqual([second.id, first.id]);
  });

  it("finds the most recent mapping for an account, scoped to the user", async () => {
    const olderMapping: ColumnMapping = { ...MAPPING, amount: "Amount v1" };
    const newerMapping: ColumnMapping = { ...MAPPING, amount: "Amount v2" };

    await batches.create(
      "user-mapping",
      mappingAccountId,
      "old.csv",
      "sha256:mapping-1",
      olderMapping
    );
    await batches.create(
      "user-mapping",
      mappingAccountId,
      "new.csv",
      "sha256:mapping-2",
      newerMapping
    );

    expect(await batches.findLatestMappingForAccount("user-mapping", mappingAccountId)).toEqual(
      newerMapping
    );
    expect(await batches.findLatestMappingForAccount("someone-else", mappingAccountId)).toBeNull();
    expect(await batches.findLatestMappingForAccount("user-mapping", accountId)).toBeNull();
  });

  it("recovers an expired worker lease and returns the owning tenant with a fresh token", async () => {
    const created = await withTxn(testDb.db, (tx) =>
      batches.create("user-a", accountId, "lease-recovery.csv", "sha256:lease-recovery", MAPPING, {
        fileContentBase64: Buffer.from("Txn Date,Narration,Amount").toString("base64"),
        correlationId: "lease-recovery-request",
        tx
      })
    );
    const claimedAt = new Date();
    const [firstClaim] = await withTxn(testDb.db, (tx) =>
      batches.systemClaimReady(claimedAt, new Date(claimedAt.getTime() + 60_000), 10, tx)
    );
    if (firstClaim === undefined) throw new Error("Expected the workflow to be claimed.");
    expect(firstClaim).toMatchObject({
      batchId: created.id,
      userId: "user-a",
      operation: "parse"
    });

    await batches.startWorkflow(
      "user-a",
      created.id,
      "parse",
      firstClaim.claimToken,
      new Date(claimedAt.getTime() + 120_000)
    );
    await expect(
      withTxn(testDb.db, (tx) =>
        batches.systemClaimReady(
          new Date(claimedAt.getTime() + 30_000),
          new Date(claimedAt.getTime() + 90_000),
          10,
          tx
        )
      )
    ).resolves.toEqual([]);

    const [recovered] = await withTxn(testDb.db, (tx) =>
      batches.systemClaimReady(
        new Date(claimedAt.getTime() + 121_000),
        new Date(claimedAt.getTime() + 181_000),
        10,
        tx
      )
    );
    if (recovered === undefined) throw new Error("Expected the expired workflow to be recovered.");
    expect(recovered.userId).toBe("user-a");
    expect(recovered.claimToken).not.toBe(firstClaim.claimToken);
  });
});
