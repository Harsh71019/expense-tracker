import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { accounts } from "../../../src/common/db/schema/index.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("AccountRepository tenancy and archive behavior", () => {
  let testDb: TestDb;
  let repository: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    repository = new AccountRepository(testDb.db);
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("keeps same-named accounts isolated by user and archives without deleting", async () => {
    const aAccount = await withTxn(testDb.db, (tx) =>
      repository.create("user-a", { name: "Cash", type: "cash", openingBalanceMinor: 5_000 }, tx)
    );
    const bAccount = await withTxn(testDb.db, (tx) =>
      repository.create("user-b", { name: "Cash", type: "cash", openingBalanceMinor: 8_000 }, tx)
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

    const [archived] = await testDb.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, "user-a"), eq(accounts.name, "Cash")));
    expect(archived).toMatchObject({ isArchived: true, balanceMinor: 5_000 });
  });
});
