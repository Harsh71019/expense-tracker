import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AccountService } from "../../../src/accounts/account.service.js";
import { AccountMutationService } from "../../../src/accounts/account-mutation.service.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { accounts } from "../../../src/common/db/schema/index.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("AccountService", () => {
  let testDb: TestDb;
  let accountService: AccountService;
  let accountMutations: AccountMutationService;

  beforeAll(async () => {
    testDb = await createTestDb();
    const repository = new AccountRepository(testDb.db);
    accountService = new AccountService(testDb.db, repository);
    accountMutations = new AccountMutationService(
      repository,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");
    await insertTestUser(testDb.db, "user-idempotent");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates and lists accounts scoped by user", async () => {
    const accA = await accountService.create("user-a", {
      name: "HDFC Savings",
      type: "bank",
      openingBalanceMinor: 10_000
    });
    const accB = await accountService.create("user-b", {
      name: "ICICI Savings",
      type: "bank",
      openingBalanceMinor: 20_000
    });

    const listA = await accountService.list("user-a");
    expect(listA.length).toBe(1);
    expect(listA[0]).toMatchObject({
      id: accA.id,
      userId: "user-a",
      name: "HDFC Savings",
      balanceMinor: 10_000
    });

    const listB = await accountService.list("user-b");
    expect(listB.length).toBe(1);
    expect(listB[0]).toMatchObject({
      id: accB.id,
      userId: "user-b",
      name: "ICICI Savings",
      balanceMinor: 20_000
    });
  });

  it("archives an account successfully and throws EntityNotFoundError if non-existent or owned by another user", async () => {
    const acc = await accountService.create("user-a", {
      name: "Cash",
      type: "cash",
      openingBalanceMinor: 5_000
    });

    // Archiving user-a's account as user-b should fail
    await expect(accountService.archive("user-b", acc.id)).rejects.toThrow(EntityNotFoundError);

    // Archiving as the correct user should succeed
    await expect(accountService.archive("user-a", acc.id)).resolves.toBeUndefined();

    // Archiving again should fail since it's already archived
    await expect(accountService.archive("user-a", acc.id)).rejects.toThrow(EntityNotFoundError);
  });

  it("creates and archives exactly once across five identical mutation attempts", async () => {
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        accountMutations.create(
          "user-idempotent",
          { name: "Replay-safe wallet", type: "wallet", openingBalanceMinor: 2_500 },
          "11111111-aaaa-4111-8111-111111111111"
        )
      )
    );

    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(creates.map((result) => result.result.id)).size).toBe(1);
    expect(
      (
        await testDb.db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.userId, "user-idempotent"), eq(accounts.name, "Replay-safe wallet"))
          )
      ).length
    ).toBe(1);

    const accountId = creates[0]?.result.id;
    if (accountId === undefined) throw new Error("Expected a created account");
    const archives = await Promise.all(
      Array.from({ length: 5 }, () =>
        accountMutations.archive(
          "user-idempotent",
          accountId,
          "22222222-aaaa-4222-8222-222222222222"
        )
      )
    );

    expect(archives.filter((result) => !result.replayed)).toHaveLength(1);
    expect(archives.every((result) => result.result === null)).toBe(true);
    expect(
      (
        await testDb.db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.isArchived, true)))
      ).length
    ).toBe(1);
  });
});
