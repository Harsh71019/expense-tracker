import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransferService } from "../../../src/transactions/transfer.service.js";

describe("TransferService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let transfers: TransferService | undefined;
  let hdfcAccountId: string | undefined;
  let cashAccountId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_transfers_test")).asPromise();
    const accountRepository = new AccountRepository(connection);
    transfers = new TransferService(
      connection,
      accountRepository,
      new TransactionRepository(connection),
      new AuditRepository(connection),
      { log: () => undefined, warn: () => undefined }
    );
    await connectedDatabase(connection)
      .collection("transactions")
      .createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
    await connectedDatabase(connection)
      .collection("transactions")
      .createIndex({ reversalOf: 1 }, { unique: true, sparse: true });
    await connectedDatabase(connection)
      .collection("transactions")
      .createIndex({ transferGroupId: 1 }, { sparse: true });

    const hdfc = await withTxn(connectedConnection(connection), async (session) =>
      accountRepository.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        session
      )
    );
    hdfcAccountId = hdfc.id;

    const cash = await withTxn(connectedConnection(connection), async (session) =>
      accountRepository.create(
        "user-a",
        { name: "Cash", type: "cash", openingBalanceMinor: 5_000 },
        session
      )
    );
    cashAccountId = cash.id;
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("moves money atomically between two accounts as linked expense/income legs", async () => {
    const service = transferService(transfers);
    const result = await service.create(
      "user-a",
      {
        fromAccountId: existingId(hdfcAccountId),
        toAccountId: existingId(cashAccountId),
        amountMinor: 10_000,
        occurredAt: new Date("2026-07-12T09:00:00.000Z"),
        description: "ATM withdrawal",
        tags: []
      },
      "aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa"
    );

    expect(result.replayed).toBe(false);
    expect(result.fromTransaction.type).toBe("expense");
    expect(result.toTransaction.type).toBe("income");
    expect(result.fromTransaction.transferGroupId).toBe(result.transferGroupId);
    expect(result.toTransaction.transferGroupId).toBe(result.transferGroupId);

    const hdfc = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "HDFC Savings" });
    expect(hdfc).toMatchObject({ balanceMinor: 90_000 });

    const cash = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "Cash" });
    expect(cash).toMatchObject({ balanceMinor: 15_000 });

    expect(
      await connectedDatabase(connection)
        .collection("transactions")
        .countDocuments({ transferGroupId: { $exists: true } })
    ).toBe(2);
    expect(
      await connectedDatabase(connection)
        .collection("audit_log")
        .countDocuments({ action: "transfer.create" })
    ).toBe(2);
  });

  it("replays the same transfer exactly once under concurrent duplicate submissions", async () => {
    const service = transferService(transfers);
    const key = "bbbbbbbb-2222-4222-a222-bbbbbbbbbbbb";
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.create(
          "user-a",
          {
            fromAccountId: existingId(hdfcAccountId),
            toAccountId: existingId(cashAccountId),
            amountMinor: 2_000,
            occurredAt: new Date("2026-07-13T09:00:00.000Z"),
            description: "Chai fund top-up",
            tags: []
          },
          key
        )
      )
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    const groupIds = new Set(results.map((result) => result.transferGroupId));
    expect(groupIds.size).toBe(1);

    expect(
      await connectedDatabase(connection)
        .collection("transactions")
        .countDocuments({ idempotencyKey: key })
    ).toBe(1);

    const hdfc = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "HDFC Savings" });
    expect(hdfc).toMatchObject({ balanceMinor: 88_000 });
  });

  it("rolls back both balance changes when the destination account does not exist", async () => {
    const service = transferService(transfers);
    await expect(
      service.create(
        "user-a",
        {
          fromAccountId: existingId(hdfcAccountId),
          toAccountId: "0123456789abcdef01234567",
          amountMinor: 500,
          occurredAt: new Date("2026-07-14T09:00:00.000Z"),
          description: "Bad transfer",
          tags: []
        },
        "cccccccc-3333-4333-a333-cccccccccccc"
      )
    ).rejects.toThrow("Account not found.");

    const hdfc = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "HDFC Savings" });
    expect(hdfc).toMatchObject({ balanceMinor: 88_000 });
    expect(
      await connectedDatabase(connection)
        .collection("transactions")
        .countDocuments({ idempotencyKey: "cccccccc-3333-4333-a333-cccccccccccc" })
    ).toBe(0);
  });

  it("reverses both legs atomically, restoring original balances", async () => {
    const service = transferService(transfers);
    const original = await service.create(
      "user-a",
      {
        fromAccountId: existingId(hdfcAccountId),
        toAccountId: existingId(cashAccountId),
        amountMinor: 1_000,
        occurredAt: new Date("2026-07-15T09:00:00.000Z"),
        description: "Coffee fund",
        tags: []
      },
      "dddddddd-4444-4444-a444-dddddddddddd"
    );

    const before = {
      hdfc: await connectedDatabase(connection)
        .collection("accounts")
        .findOne({ userId: "user-a", name: "HDFC Savings" }),
      cash: await connectedDatabase(connection)
        .collection("accounts")
        .findOne({ userId: "user-a", name: "Cash" })
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.reverse("user-a", original.transferGroupId))
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    const groupIds = new Set(results.map((result) => result.transferGroupId));
    expect(groupIds.size).toBe(1);
    expect(groupIds.has(original.transferGroupId)).toBe(false);

    const hdfc = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "HDFC Savings" });
    const cash = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ userId: "user-a", name: "Cash" });
    expect(hdfc?.balanceMinor).toBe(accountBalance(before.hdfc) + 1_000);
    expect(cash?.balanceMinor).toBe(accountBalance(before.cash) - 1_000);

    expect(
      await connectedDatabase(connection)
        .collection("transactions")
        .countDocuments({ transferGroupId: new Types.ObjectId(reversalGroupId(results)) })
    ).toBe(2);
  });

  it("cannot reverse a transfer that belongs to another user", async () => {
    const service = transferService(transfers);
    const original = await service.create(
      "user-a",
      {
        fromAccountId: existingId(hdfcAccountId),
        toAccountId: existingId(cashAccountId),
        amountMinor: 400,
        occurredAt: new Date("2026-07-16T09:00:00.000Z"),
        description: "Snacks",
        tags: []
      },
      "eeeeeeee-5555-4555-a555-eeeeeeeeeeee"
    );

    await expect(service.reverse("someone-else", original.transferGroupId)).rejects.toThrow(
      "Transaction cannot be reversed."
    );
  });

  function existingId(id: string | undefined): string {
    if (id === undefined) throw new Error("Fixture id is not ready");
    return id;
  }
});

function reversalGroupId(results: ReadonlyArray<{ transferGroupId: string }>): string {
  const first = results[0];
  if (first === undefined) throw new Error("Expected at least one reversal result");
  return first.transferGroupId;
}

function accountBalance(account: Record<string, unknown> | null): number {
  const balance = account?.balanceMinor;
  if (typeof balance !== "number") throw new Error("Account fixture missing balanceMinor");
  return balance;
}

function transferService(service: TransferService | undefined): TransferService {
  if (service === undefined) throw new Error("Transfer service is not ready");
  return service;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  return connection;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = connectedConnection(connection).db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}
