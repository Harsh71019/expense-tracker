import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";
import { NotFoundException } from "@nestjs/common";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AccountService } from "../../../src/accounts/account.service.js";

describe("AccountService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let accountService: AccountService | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_account_service_test")
    ).asPromise();
    const repository = new AccountRepository(connection);
    accountService = new AccountService(connection, repository);
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

  it("archives an account successfully and throws NotFoundException if non-existent or owned by another user", async () => {
    const service = getAccountService(accountService);

    const acc = await service.create("user-a", {
      name: "Cash",
      type: "cash",
      openingBalanceMinor: 5_000
    });

    // Archiving user-a's account as user-b should fail
    await expect(service.archive("user-b", acc.id)).rejects.toThrow(NotFoundException);

    // Archiving as the correct user should succeed
    await expect(service.archive("user-a", acc.id)).resolves.toBeUndefined();

    // Archiving again should fail since it's already archived
    await expect(service.archive("user-a", acc.id)).rejects.toThrow(NotFoundException);
  });
});

function getAccountService(service: AccountService | undefined): AccountService {
  if (service === undefined) throw new Error("Account service is not ready");
  return service;
}
