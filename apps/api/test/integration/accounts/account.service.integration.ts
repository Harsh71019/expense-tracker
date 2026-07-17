import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";
import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AccountService } from "../../../src/accounts/account.service.js";
import { AccountMutationService } from "../../../src/accounts/account-mutation.service.js";
import { IdempotencyRepository } from "../../../src/common/idempotency/idempotency.repository.js";
import { IdempotencyService } from "../../../src/common/idempotency/idempotency.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";

describe("AccountService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let accountService: AccountService | undefined;
  let accountMutations: AccountMutationService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_account_service_test")
    ).asPromise();
    const repository = new AccountRepository(connection);
    accountService = new AccountService(connection, repository);
    accountMutations = new AccountMutationService(
      connection,
      repository,
      new IdempotencyService(new IdempotencyRepository(connection))
    );
    await connectedDatabase(connection)
      .collection("idempotency_records")
      .createIndex({ userId: 1, operation: 1, key: 1 }, { unique: true });
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("creates and lists accounts scoped by user", async () => {
    const service = getAccountService(accountService);

    const accA = await service.create("user-a", {
      name: "HDFC Savings",
      type: "bank",
      openingBalanceMinor: 10_000
    });
    const accB = await service.create("user-b", {
      name: "ICICI Savings",
      type: "bank",
      openingBalanceMinor: 20_000
    });

    const listA = await service.list("user-a");
    expect(listA.length).toBe(1);
    expect(listA[0]).toMatchObject({
      id: accA.id,
      userId: "user-a",
      name: "HDFC Savings",
      balanceMinor: 10_000
    });

    const listB = await service.list("user-b");
    expect(listB.length).toBe(1);
    expect(listB[0]).toMatchObject({
      id: accB.id,
      userId: "user-b",
      name: "ICICI Savings",
      balanceMinor: 20_000
    });
  });

  it("archives an account successfully and throws EntityNotFoundError if non-existent or owned by another user", async () => {
    const service = getAccountService(accountService);

    const acc = await service.create("user-a", {
      name: "Cash",
      type: "cash",
      openingBalanceMinor: 5_000
    });

    // Archiving user-a's account as user-b should fail
    await expect(service.archive("user-b", acc.id)).rejects.toThrow(EntityNotFoundError);

    // Archiving as the correct user should succeed
    await expect(service.archive("user-a", acc.id)).resolves.toBeUndefined();

    // Archiving again should fail since it's already archived
    await expect(service.archive("user-a", acc.id)).rejects.toThrow(EntityNotFoundError);
  });

  it("creates and archives exactly once across five identical mutation attempts", async () => {
    const mutations = getAccountMutations(accountMutations);
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.create(
          "user-idempotent",
          { name: "Replay-safe wallet", type: "wallet", openingBalanceMinor: 2_500 },
          "11111111-aaaa-4111-8111-111111111111"
        )
      )
    );

    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(creates.map((result) => result.result.id)).size).toBe(1);
    expect(
      await connectedDatabase(connection)
        .collection("accounts")
        .countDocuments({ userId: "user-idempotent", name: "Replay-safe wallet" })
    ).toBe(1);

    const accountId = creates[0]?.result.id;
    if (accountId === undefined) throw new Error("Expected a created account");
    const archives = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.archive("user-idempotent", accountId, "22222222-aaaa-4222-8222-222222222222")
      )
    );

    expect(archives.filter((result) => !result.replayed)).toHaveLength(1);
    expect(archives.every((result) => result.result === null)).toBe(true);
    expect(
      await connectedDatabase(connection)
        .collection("accounts")
        .countDocuments({ _id: new Types.ObjectId(accountId), isArchived: true })
    ).toBe(1);
  });
});

function getAccountService(service: AccountService | undefined): AccountService {
  if (service === undefined) throw new Error("Account service is not ready");
  return service;
}

function getAccountMutations(service: AccountMutationService | undefined): AccountMutationService {
  if (service === undefined) throw new Error("Account mutation service is not ready");
  return service;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  const database = connection.db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}
