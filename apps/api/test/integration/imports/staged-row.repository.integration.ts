import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";

import type { NewStagedRow } from "../../../src/imports/staged-row.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";

function row(overrides: Partial<NewStagedRow> = {}): NewStagedRow {
  return {
    rowNumber: 1,
    raw: { "Txn Date": "04/07/2026", Narration: "Chai", Amount: "-20.00" },
    problems: [],
    isDuplicate: false,
    include: true,
    ...overrides
  };
}

describe("StagedRowRepository", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let rows: StagedRowRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_staged_rows_test")).asPromise();
    rows = new StagedRowRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("inserts nothing for an empty batch instead of erroring on an empty insertMany", async () => {
    const repository = stagedRowRepository(rows);
    const batchId = new Types.ObjectId().toString();
    await expect(repository.insertMany(batchId, [])).resolves.toBeUndefined();
  });

  it("bulk-inserts staged rows scoped to their batch", async () => {
    const repository = stagedRowRepository(rows);
    const batchId = new Types.ObjectId().toString();
    const otherBatchId = new Types.ObjectId().toString();

    await repository.insertMany(batchId, [
      row({ rowNumber: 1 }),
      row({
        rowNumber: 2,
        parsed: {
          occurredAt: new Date("2026-07-04T00:00:00Z"),
          amountMinor: 2_000,
          type: "expense",
          description: "Chai"
        },
        dedupeHash: "hash-2"
      })
    ]);
    await repository.insertMany(otherBatchId, [row({ rowNumber: 1 })]);

    const stored = await connectedDatabase(connection)
      .collection("staged_rows")
      .find({ batchId: new Types.ObjectId(batchId) })
      .sort({ rowNumber: 1 })
      .toArray();

    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ rowNumber: 1, include: true, isDuplicate: false });
    expect(stored[1]).toMatchObject({ rowNumber: 2, dedupeHash: "hash-2" });
    expect(stored[1]?.parsed).toMatchObject({ amountMinor: 2_000, type: "expense" });
  });

  it("clears only the target batch's rows, leaving other batches untouched", async () => {
    const repository = stagedRowRepository(rows);
    const batchId = new Types.ObjectId().toString();
    const otherBatchId = new Types.ObjectId().toString();
    await repository.insertMany(batchId, [row({ rowNumber: 1 })]);
    await repository.insertMany(otherBatchId, [row({ rowNumber: 1 })]);

    await repository.deleteAllForBatch(batchId);

    const database = connectedDatabase(connection);
    expect(
      await database
        .collection("staged_rows")
        .countDocuments({ batchId: new Types.ObjectId(batchId) })
    ).toBe(0);
    expect(
      await database
        .collection("staged_rows")
        .countDocuments({ batchId: new Types.ObjectId(otherBatchId) })
    ).toBe(1);
  });
});

function stagedRowRepository(repository: StagedRowRepository | undefined): StagedRowRepository {
  if (repository === undefined) {
    throw new Error("Staged row repository is not ready");
  }
  return repository;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  if (connection === undefined) {
    throw new Error("MongoDB connection is not ready");
  }
  const database = connection.db;
  if (database === undefined) {
    throw new Error("MongoDB database is not ready");
  }
  return database;
}
