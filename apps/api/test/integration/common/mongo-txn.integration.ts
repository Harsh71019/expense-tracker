import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { withTxn } from "../../../src/common/mongo-txn.js";

describe("withTxn", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_txn_test")).asPromise();
  });

  afterAll(async () => {
    if (connection !== undefined) {
      await connection.close();
    }
    if (replicaSet !== undefined) {
      await replicaSet.stop();
    }
  });

  it("rolls back every write when the operation fails", async () => {
    const database = connectedDatabase(connection);

    await expect(
      withTxn(connectedConnection(connection), async (session) => {
        await database
          .collection("transaction_proofs")
          .insertOne({ marker: "rollback" }, { session });
        throw new Error("Induced transaction failure");
      })
    ).rejects.toThrow("Induced transaction failure");

    expect(
      await database.collection("transaction_proofs").findOne({ marker: "rollback" })
    ).toBeNull();
  });

  it("returns the operation result after committing its writes", async () => {
    const database = connectedDatabase(connection);
    const result = await withTxn(connectedConnection(connection), async (session) => {
      await database.collection("transaction_proofs").insertOne({ marker: "commit" }, { session });
      return "committed";
    });

    expect(result).toBe("committed");
    expect(
      await database.collection("transaction_proofs").findOne({ marker: "commit" })
    ).not.toBeNull();
  });
});

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) {
    throw new Error("MongoDB connection is not ready");
  }

  return connection;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = connectedConnection(connection).db;
  if (database === undefined) {
    throw new Error("MongoDB database is not ready");
  }

  return database;
}
