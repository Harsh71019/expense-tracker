import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";

describe("AccountRepository tenancy and archive behavior", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let accounts: AccountRepository | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_accounts_test")).asPromise();
    accounts = new AccountRepository(connection);
  });

  afterAll(async () => {
    if (connection !== undefined) {
      await connection.close();
    }
    if (replicaSet !== undefined) {
      await replicaSet.stop();
    }
  });

  it("keeps same-named accounts isolated by user and archives without deleting", async () => {
    const repository = accountRepository(accounts);
    const aAccount = await withTxn(connectedConnection(connection), async (session) =>
      repository.create(
        "user-a",
        { name: "Cash", type: "cash", openingBalanceMinor: 5_000 },
        session
      )
    );
    const bAccount = await withTxn(connectedConnection(connection), async (session) =>
      repository.create(
        "user-b",
        { name: "Cash", type: "cash", openingBalanceMinor: 8_000 },
        session
      )
    );

    expect(await repository.list("user-a")).toMatchObject([
      { id: aAccount.id, balanceMinor: 5_000 }
    ]);
    expect(await repository.list("user-b")).toMatchObject([
      { id: bAccount.id, balanceMinor: 8_000 }
    ]);

    expect(await repository.archive("user-a", bAccount.id)).toBe(false);
    expect(await repository.archive("user-a", aAccount.id)).toBe(true);
    expect(await repository.list("user-a")).toEqual([]);

    const archived = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "Cash" });
    expect(archived).toMatchObject({ isArchived: true, balanceMinor: 5_000 });
  });
});

function accountRepository(repository: AccountRepository | undefined): AccountRepository {
  if (repository === undefined) {
    throw new Error("Account repository is not ready");
  }

  return repository;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = connectedConnection(connection).db;
  if (database === undefined) {
    throw new Error("MongoDB database is not ready");
  }

  return database;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) {
    throw new Error("MongoDB connection is not ready");
  }

  return connection;
}
