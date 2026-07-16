import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";
import type { ColumnMapping } from "@vyaya/shared";

import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";

const MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

describe("ImportBatchRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let batches: ImportBatchRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_import_batches_test")).asPromise();
    batches = new ImportBatchRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("creates a batch pending parse, with zeroed stats", async () => {
    const repository = importBatchRepository(batches);
    const batch = await repository.create(
      "user-a",
      "0123456789abcdef01234567",
      "hdfc-july.csv",
      "sha256:abc",
      MAPPING
    );

    expect(batch).toMatchObject({
      userId: "user-a",
      filename: "hdfc-july.csv",
      fileHash: "sha256:abc",
      status: "pending",
      stats: { total: 0, staged: 0, duplicates: 0, committed: 0 }
    });
  });

  it("keeps batches isolated by user and scoped lookups fail closed", async () => {
    const repository = importBatchRepository(batches);
    const batch = await repository.create(
      "user-a",
      "0123456789abcdef01234567",
      "isolated.csv",
      "sha256:isolated",
      MAPPING
    );

    expect(await repository.findById("user-a", batch.id)).toMatchObject({ id: batch.id });
    expect(await repository.findById("user-b", batch.id)).toBeNull();
  });

  it("finds an existing batch by fileHash, scoped to the user — the re-upload guard", async () => {
    const repository = importBatchRepository(batches);
    await repository.create(
      "user-a",
      "0123456789abcdef01234567",
      "dupe.csv",
      "sha256:dupe-check",
      MAPPING
    );

    expect(await repository.findByFileHash("user-a", "sha256:dupe-check")).toMatchObject({
      filename: "dupe.csv"
    });
    expect(await repository.findByFileHash("user-b", "sha256:dupe-check")).toBeNull();
    expect(await repository.findByFileHash("user-a", "sha256:never-uploaded")).toBeNull();
  });

  it("markParsed only transitions a batch that is still pending", async () => {
    const repository = importBatchRepository(batches);
    const batch = await repository.create(
      "user-a",
      "0123456789abcdef01234567",
      "transitions.csv",
      "sha256:transitions",
      MAPPING
    );

    await repository.markParsed(batch.id, "staged", {
      total: 3,
      staged: 2,
      duplicates: 1,
      committed: 0
    });
    const staged = await repository.findById("user-a", batch.id);
    expect(staged).toMatchObject({ status: "staged", stats: { total: 3, staged: 2 } });

    // A second markParsed call (e.g. a duplicate job delivery) must not clobber
    // an already-resolved batch — the filter requires status: "pending".
    await repository.markParsed(batch.id, "failed", {
      total: 0,
      staged: 0,
      duplicates: 0,
      committed: 0
    });
    const stillStaged = await repository.findById("user-a", batch.id);
    expect(stillStaged).toMatchObject({ status: "staged", stats: { total: 3, staged: 2 } });
  });

  it("lists a user's batches newest first, scoped to that user", async () => {
    const repository = importBatchRepository(batches);
    const first = await repository.create(
      "user-list",
      "0123456789abcdef01234567",
      "first.csv",
      "sha256:list-1",
      MAPPING
    );
    const second = await repository.create(
      "user-list",
      "0123456789abcdef01234567",
      "second.csv",
      "sha256:list-2",
      MAPPING
    );
    await repository.create(
      "someone-else",
      "0123456789abcdef01234567",
      "not-mine.csv",
      "sha256:list-3",
      MAPPING
    );

    const list = await repository.list("user-list");
    expect(list.map((batch) => batch.id)).toEqual([second.id, first.id]);
  });
});

function importBatchRepository(
  repository: ImportBatchRepository | undefined
): ImportBatchRepository {
  if (repository === undefined) {
    throw new Error("Import batch repository is not ready");
  }
  return repository;
}
